import type { Post } from '@/lib/telegram';
import { getChannelInfo } from '@/lib/telegram';
import { getTextPreview } from '@/lib/mood-utils';
import { getNotifyConfig, getNotifyFromAddress, requireConfigValue } from './env';
import { CloudflareKvClient } from './kv';
import {
  createNotifyToken,
  hashEmail,
  isValidEmail,
  normalizeEmail,
  verifyNotifyToken,
} from './security';
import { sendEmailWithResend } from './resend';
import { buildMoodNotificationEmail, buildSubscribeConfirmEmail } from './templates';
import type {
  ConfirmResult,
  DispatchResult,
  RetryProcessResult,
  RetryRecord,
  SentRecord,
  SubscribeResult,
  SubscriberRecord,
  UnsubscribeResult,
} from './types';

export interface NotifyRequestContext {
  request: Request;
  locals?: any;
}

export class NotifyServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'NotifyServiceError';
  }
}

const SUBSCRIBER_PREFIX = 'notify:subscriber:';
const SENT_PREFIX = 'notify:sent:';
const RETRY_PREFIX = 'notify:retry:';
const DEAD_PREFIX = 'notify:dead:';

const SUBSCRIBE_TOKEN_TTL_SECONDS = 24 * 60 * 60;
const UNSUBSCRIBE_TOKEN_TTL_SECONDS = 180 * 24 * 60 * 60;
const SENT_RECORD_TTL_SECONDS = 180 * 24 * 60 * 60;

const RETRY_DELAYS_MINUTES = [5, 30, 120, 720, 1440];
const MAX_RETRY_ATTEMPTS = 5;
const DEFAULT_SEND_CONCURRENCY = 4;
const DEFAULT_RETRY_SCAN_LIMIT = 500;
const DEFAULT_RETRY_PROCESS_LIMIT = 50;

function nowIso(): string {
  return new Date().toISOString();
}

function unixNow(): number {
  return Math.floor(Date.now() / 1000);
}

function subscriberKey(emailHash: string): string {
  return `${SUBSCRIBER_PREFIX}${emailHash}`;
}

function sentKey(postId: string, emailHash: string): string {
  return `${SENT_PREFIX}${postId}:${emailHash}`;
}

function retryKey(postId: string, emailHash: string): string {
  return `${RETRY_PREFIX}${postId}:${emailHash}`;
}

function deadKey(postId: string, emailHash: string): string {
  return `${DEAD_PREFIX}${postId}:${emailHash}:${Date.now()}`;
}

function getSiteUrl(context: NotifyRequestContext): string {
  const config = getNotifyConfig(context);
  if (config.siteUrl) {
    return config.siteUrl;
  }
  return new URL(context.request.url).origin;
}

function createKvClient(context: NotifyRequestContext): CloudflareKvClient {
  const config = getNotifyConfig(context);
  requireConfigValue(config.cloudflareAccountId, 'CLOUDFLARE_ACCOUNT_ID');
  requireConfigValue(config.cloudflareApiToken, 'CLOUDFLARE_API_TOKEN');
  requireConfigValue(
    config.cloudflareNotifyNamespaceId,
    'CLOUDFLARE_NOTIFY_KV_NAMESPACE_ID or CLOUDFLARE_KV_NAMESPACE_ID'
  );

  return new CloudflareKvClient({
    accountId: config.cloudflareAccountId,
    apiToken: config.cloudflareApiToken,
    namespaceId: config.cloudflareNotifyNamespaceId,
  });
}

function requireEmailSendingConfig(context: NotifyRequestContext): void {
  const config = getNotifyConfig(context);
  requireConfigValue(config.resendApiKey, 'RESEND_API_KEY');
  requireConfigValue(config.notifyFrom, 'NOTIFY_FROM_EMAIL');
  requireConfigValue(config.tokenSecret, 'EMAIL_NOTIFY_SECRET');
}

async function getSubscriberByEmail(
  kv: CloudflareKvClient,
  email: string
): Promise<SubscriberRecord | null> {
  const emailHash = hashEmail(email);
  return kv.getJson<SubscriberRecord>(subscriberKey(emailHash));
}

async function upsertSubscriber(
  kv: CloudflareKvClient,
  record: SubscriberRecord
): Promise<void> {
  await kv.putJson(subscriberKey(record.emailHash), record);
}

async function listActiveSubscribers(kv: CloudflareKvClient): Promise<SubscriberRecord[]> {
  const keys = await kv.listKeys(SUBSCRIBER_PREFIX, 10000);
  if (!keys.length) return [];

  const records = await Promise.all(keys.map((key) => kv.getJson<SubscriberRecord>(key)));
  return records
    .filter((record): record is SubscriberRecord => Boolean(record && record.email && record.emailHash))
    .filter((record) => record.status === 'active');
}

function normalizePostId(value: string): string {
  return value.trim();
}

function getRetryDelayMinutes(attempt: number): number {
  const index = Math.max(0, Math.min(attempt - 1, RETRY_DELAYS_MINUTES.length - 1));
  return RETRY_DELAYS_MINUTES[index];
}

async function scheduleRetry(
  kv: CloudflareKvClient,
  input: {
    postId: string;
    email: string;
    emailHash: string;
    lastError: string;
  }
): Promise<{ scheduled: boolean; attempt: number }> {
  const key = retryKey(input.postId, input.emailHash);
  const existing = await kv.getJson<RetryRecord>(key);
  const attempt = (existing?.attempt ?? 0) + 1;
  const createdAt = existing?.createdAt ?? nowIso();

  if (attempt > MAX_RETRY_ATTEMPTS) {
    await kv.putJson(deadKey(input.postId, input.emailHash), {
      ...input,
      createdAt,
      updatedAt: nowIso(),
      attempt,
    });
    await kv.delete(key);
    return { scheduled: false, attempt };
  }

  const delayMinutes = getRetryDelayMinutes(attempt);
  const nextAttemptAt = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();

  const record: RetryRecord = {
    postId: input.postId,
    email: input.email,
    emailHash: input.emailHash,
    attempt,
    createdAt,
    updatedAt: nowIso(),
    nextAttemptAt,
    lastError: input.lastError.slice(0, 500),
  };

  await kv.putJson(key, record);
  return { scheduled: true, attempt };
}

async function markAsSent(
  kv: CloudflareKvClient,
  postId: string,
  emailHash: string,
  resendId?: string
): Promise<void> {
  const record: SentRecord = {
    postId,
    emailHash,
    sentAt: nowIso(),
    resendId,
  };
  await kv.putJson(sentKey(postId, emailHash), record, {
    expirationTtl: SENT_RECORD_TTL_SECONDS,
  });
}

async function hasBeenSent(
  kv: CloudflareKvClient,
  postId: string,
  emailHash: string
): Promise<boolean> {
  const record = await kv.get(sentKey(postId, emailHash));
  return Boolean(record);
}

async function loadMoodPost(
  context: NotifyRequestContext,
  postId: string
): Promise<Post | null> {
  try {
    const result = (await getChannelInfo(
      {
        request: context.request,
        locals: context.locals,
      } as any,
      {
        type: 'single',
        id: postId,
        skipCache: true,
      }
    )) as Post;

    if (!result || !result.id || result.type !== 'text') {
      return null;
    }

    return result;
  } catch (error) {
    console.error('Notify failed to load mood post:', error);
    return null;
  }
}

async function sendMoodEmail(
  context: NotifyRequestContext,
  kv: CloudflareKvClient,
  input: {
    post: Post;
    previewText: string;
    subscriber: SubscriberRecord;
    force: boolean;
  }
): Promise<{ sent: boolean; resendId?: string }> {
  const config = getNotifyConfig(context);
  const postId = input.post.id;

  if (!input.force) {
    const alreadySent = await hasBeenSent(kv, postId, input.subscriber.emailHash);
    if (alreadySent) {
      return { sent: false };
    }
  }

  const unsubscribeToken = createNotifyToken(
    {
      action: 'unsubscribe',
      email: input.subscriber.email,
      exp: unixNow() + UNSUBSCRIBE_TOKEN_TTL_SECONDS,
    },
    config.tokenSecret
  );

  const siteUrl = getSiteUrl(context);
  const moodUrl = `${siteUrl}/mood/${input.post.id}`;
  const unsubscribeUrl = `${siteUrl}/api/notify/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;

  const email = buildMoodNotificationEmail({
    moodUrl,
    unsubscribeUrl,
    previewText: input.previewText,
    postId: input.post.id,
  });

  const response = await sendEmailWithResend({
    apiKey: config.resendApiKey,
    from: getNotifyFromAddress(config),
    to: input.subscriber.email,
    replyTo: config.notifyReplyTo || undefined,
    subject: email.subject,
    html: email.html,
    text: email.text,
    idempotencyKey: `mood-${postId}-${input.subscriber.emailHash}`,
  });

  await markAsSent(kv, postId, input.subscriber.emailHash, response.id);
  await kv.delete(retryKey(postId, input.subscriber.emailHash));

  return { sent: true, resendId: response.id };
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  const limit = Math.max(1, concurrency);
  let index = 0;

  async function runNext(): Promise<void> {
    const currentIndex = index;
    index += 1;
    if (currentIndex >= items.length) {
      return;
    }

    await worker(items[currentIndex]);
    await runNext();
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => runNext());
  await Promise.all(workers);
}

export async function requestMoodSubscription(
  context: NotifyRequestContext,
  emailInput: string
): Promise<SubscribeResult> {
  requireEmailSendingConfig(context);

  const email = normalizeEmail(emailInput || '');
  if (!isValidEmail(email)) {
    throw new NotifyServiceError(400, 'invalid_email', 'Invalid email address');
  }

  const kv = createKvClient(context);
  const config = getNotifyConfig(context);
  const existing = await getSubscriberByEmail(kv, email);

  if (existing?.status === 'active') {
    return {
      status: 'already_subscribed',
      email,
    };
  }

  const token = createNotifyToken(
    {
      action: 'subscribe',
      email,
      exp: unixNow() + SUBSCRIBE_TOKEN_TTL_SECONDS,
    },
    config.tokenSecret
  );

  const siteUrl = getSiteUrl(context);
  const confirmUrl = `${siteUrl}/api/notify/confirm?token=${encodeURIComponent(token)}`;
  const mail = buildSubscribeConfirmEmail({
    siteUrl,
    confirmUrl,
  });

  await sendEmailWithResend({
    apiKey: config.resendApiKey,
    from: getNotifyFromAddress(config),
    to: email,
    replyTo: config.notifyReplyTo || undefined,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    idempotencyKey: `subscribe-${hashEmail(email)}-${Math.floor(Date.now() / 60_000)}`,
  });

  const now = nowIso();
  const emailHash = hashEmail(email);
  await upsertSubscriber(kv, {
    email,
    emailHash,
    status: 'pending',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    confirmedAt: existing?.confirmedAt,
    lastConfirmSentAt: now,
  });

  return {
    status: 'confirmation_sent',
    email,
  };
}

export async function confirmMoodSubscription(
  context: NotifyRequestContext,
  token: string
): Promise<ConfirmResult> {
  const config = getNotifyConfig(context);
  requireConfigValue(config.tokenSecret, 'EMAIL_NOTIFY_SECRET');

  const payload = verifyNotifyToken(token, config.tokenSecret);
  if (payload.action !== 'subscribe') {
    throw new NotifyServiceError(400, 'invalid_token_action', 'Invalid token action');
  }

  const email = normalizeEmail(payload.email);
  const emailHash = hashEmail(email);
  const kv = createKvClient(context);
  const existing = await kv.getJson<SubscriberRecord>(subscriberKey(emailHash));
  const now = nowIso();

  const record: SubscriberRecord = {
    email,
    emailHash,
    status: 'active',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    confirmedAt: existing?.confirmedAt ?? now,
    lastConfirmSentAt: existing?.lastConfirmSentAt,
  };

  await upsertSubscriber(kv, record);

  return {
    status: 'subscribed',
    email,
  };
}

export async function unsubscribeMoodSubscription(
  context: NotifyRequestContext,
  token: string
): Promise<UnsubscribeResult> {
  const config = getNotifyConfig(context);
  requireConfigValue(config.tokenSecret, 'EMAIL_NOTIFY_SECRET');

  const payload = verifyNotifyToken(token, config.tokenSecret);
  if (payload.action !== 'unsubscribe') {
    throw new NotifyServiceError(400, 'invalid_token_action', 'Invalid token action');
  }

  const email = normalizeEmail(payload.email);
  const emailHash = hashEmail(email);
  const kv = createKvClient(context);
  const now = nowIso();
  const existing = await kv.getJson<SubscriberRecord>(subscriberKey(emailHash));

  const record: SubscriberRecord = {
    email,
    emailHash,
    status: 'unsubscribed',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    confirmedAt: existing?.confirmedAt,
    lastConfirmSentAt: existing?.lastConfirmSentAt,
  };

  await upsertSubscriber(kv, record);

  return {
    status: 'unsubscribed',
    email,
  };
}

export async function dispatchMoodNotification(
  context: NotifyRequestContext,
  postIdInput: string,
  options: { force?: boolean } = {}
): Promise<DispatchResult> {
  requireEmailSendingConfig(context);

  const postId = normalizePostId(postIdInput);
  if (!postId) {
    throw new NotifyServiceError(400, 'invalid_post_id', 'postId is required');
  }

  const kv = createKvClient(context);
  const post = await loadMoodPost(context, postId);

  if (!post) {
    return {
      postId,
      subscribers: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      skippedReason: 'post_not_found_or_not_supported',
    };
  }

  const subscribers = await listActiveSubscribers(kv);
  const previewText = getTextPreview(post);

  const result: DispatchResult = {
    postId: post.id,
    subscribers: subscribers.length,
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  if (!subscribers.length) {
    return result;
  }

  await runWithConcurrency(subscribers, DEFAULT_SEND_CONCURRENCY, async (subscriber) => {
    try {
      const sendResult = await sendMoodEmail(context, kv, {
        post,
        previewText,
        subscriber,
        force: Boolean(options.force),
      });
      if (sendResult.sent) {
        result.sent += 1;
      } else {
        result.skipped += 1;
      }
    } catch (error) {
      result.failed += 1;
      const message = error instanceof Error ? error.message : 'Unknown email send error';
      await scheduleRetry(kv, {
        postId: post.id,
        email: subscriber.email,
        emailHash: subscriber.emailHash,
        lastError: message,
      });
    }
  });

  return result;
}

export async function processNotifyRetries(
  context: NotifyRequestContext,
  options: {
    scanLimit?: number;
    processLimit?: number;
  } = {}
): Promise<RetryProcessResult> {
  requireEmailSendingConfig(context);

  const scanLimit = options.scanLimit ?? DEFAULT_RETRY_SCAN_LIMIT;
  const processLimit = options.processLimit ?? DEFAULT_RETRY_PROCESS_LIMIT;

  const kv = createKvClient(context);
  const retryKeys = await kv.listKeys(RETRY_PREFIX, scanLimit);
  const records = await Promise.all(
    retryKeys.map(async (key) => {
      const record = await kv.getJson<RetryRecord>(key);
      return { key, record };
    })
  );

  const dueRecords = records
    .filter((entry): entry is { key: string; record: RetryRecord } => Boolean(entry.record))
    .filter((entry) => new Date(entry.record.nextAttemptAt).getTime() <= Date.now())
    .sort((a, b) =>
      new Date(a.record.nextAttemptAt).getTime() - new Date(b.record.nextAttemptAt).getTime()
    )
    .slice(0, processLimit);

  const output: RetryProcessResult = {
    scanned: retryKeys.length,
    processed: 0,
    sent: 0,
    dropped: 0,
    failed: 0,
  };

  const postCache = new Map<string, Post | null>();

  for (const entry of dueRecords) {
    output.processed += 1;

    const activeSubscriber = await kv.getJson<SubscriberRecord>(
      subscriberKey(entry.record.emailHash)
    );

    if (!activeSubscriber || activeSubscriber.status !== 'active') {
      await kv.delete(entry.key);
      output.dropped += 1;
      continue;
    }

    if (await hasBeenSent(kv, entry.record.postId, entry.record.emailHash)) {
      await kv.delete(entry.key);
      output.dropped += 1;
      continue;
    }

    let post = postCache.get(entry.record.postId);
    if (post === undefined) {
      post = await loadMoodPost(context, entry.record.postId);
      postCache.set(entry.record.postId, post);
    }

    if (!post) {
      await kv.delete(entry.key);
      output.dropped += 1;
      continue;
    }

    try {
      const previewText = getTextPreview(post);
      const sendResult = await sendMoodEmail(context, kv, {
        post,
        previewText,
        subscriber: activeSubscriber,
        force: false,
      });
      if (sendResult.sent) {
        output.sent += 1;
      } else {
        output.dropped += 1;
      }
      await kv.delete(entry.key);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown retry send error';
      const retryOutcome = await scheduleRetry(kv, {
        postId: entry.record.postId,
        email: entry.record.email,
        emailHash: entry.record.emailHash,
        lastError: message,
      });

      if (retryOutcome.scheduled) {
        output.failed += 1;
      } else {
        output.dropped += 1;
      }
    }
  }

  return output;
}

export function isAuthorizedSecret(request: Request, secret: string): boolean {
  if (!secret) return false;

  const authHeader = request.headers.get('authorization') ?? '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const headerSecret = request.headers.get('x-notify-secret')?.trim() ?? '';

  return bearer === secret || headerSecret === secret;
}
