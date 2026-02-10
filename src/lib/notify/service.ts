import type { ChannelInfo, Post } from '@/lib/telegram';
import { getChannelInfo } from '@/lib/telegram';
import { getTextPreviewWithMedia } from '@/lib/mood-utils';
import { getNotifyConfig, getNotifyFromAddress, requireConfigValue } from './env';
import { CloudflareKvClient } from './kv';
import {
  createNotifyToken,
  hashEmail,
  isValidEmail,
  normalizeEmail,
  secureCompareText,
  verifyNotifyToken,
} from './security';
import { sendEmailWithResend } from './resend';
import {
  buildMoodDigestEmail,
  buildMoodNotificationEmail,
  buildSubscribeConfirmEmail,
} from './templates';
import type {
  ConfirmResult,
  DeliveryMode,
  DispatchResult,
  RetryProcessResult,
  RetryRecord,
  ScheduledDispatchResult,
  SentRecord,
  SubscribeResult,
  SubscriberRecord,
  UnsubscribeResult,
} from './types';

export interface NotifyRequestContext {
  request: Request;
  locals?: any;
}

export interface SubscriptionRequestInput {
  email: string;
  deliveryMode?: string;
  timezone?: string;
  dailyHour?: number | string | null;
}

interface ChannelMeta {
  title?: string;
  avatarUrl?: string;
}

interface NotifyTestHooks {
  now?: () => Date;
  loadMoodPost?: (context: NotifyRequestContext, postId: string) => Promise<Post | null>;
  loadLatestMoodPost?: (context: NotifyRequestContext) => Promise<Post | null>;
  loadRecentMoodPosts?: (
    context: NotifyRequestContext,
    input: { since: Date; until: Date }
  ) => Promise<Post[]>;
  loadChannelMeta?: (context: NotifyRequestContext) => Promise<ChannelMeta | null>;
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

let notifyTestHooks: NotifyTestHooks | null = null;

export function setNotifyTestHooksForTesting(hooks: NotifyTestHooks | null): void {
  notifyTestHooks = hooks;
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
const EVERY_5H_WINDOW_MS = 5 * 60 * 60 * 1000;
const DEFAULT_DAILY_LOOKBACK_MS = 36 * 60 * 60 * 1000;
const MAX_DIGEST_POSTS = 20;
const MAX_DIGEST_FETCH_POSTS = 180;
const MAX_DIGEST_FETCH_PAGES = 12;
const DEFAULT_DAILY_TIMEZONE = 'Asia/Shanghai';
const DEFAULT_DAILY_HOUR = 9;

function nowIso(): string {
  return getNowDate().toISOString();
}

function unixNow(): number {
  return Math.floor(getNowMs() / 1000);
}

function getNowDate(): Date {
  if (!notifyTestHooks?.now) {
    return new Date();
  }
  return notifyTestHooks.now();
}

function getNowMs(): number {
  return getNowDate().getTime();
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
  return `${DEAD_PREFIX}${postId}:${emailHash}:${getNowMs()}`;
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

function normalizeDeliveryMode(value: string | null | undefined): DeliveryMode {
  const normalized = (value || '').trim().toLowerCase();
  if (!normalized) return 'immediate';

  if (normalized === 'immediate' || normalized === 'instant') return 'immediate';
  if (normalized === 'every_5h' || normalized === '5h' || normalized === 'every5h') {
    return 'every_5h';
  }
  if (normalized === 'daily') return 'daily';

  throw new NotifyServiceError(
    400,
    'invalid_delivery_mode',
    'deliveryMode must be one of immediate, every_5h, daily'
  );
}

function getSubscriberDeliveryMode(subscriber: SubscriberRecord): DeliveryMode {
  return subscriber.deliveryMode ?? 'immediate';
}

function parseDailyHour(value: number | string | null | undefined): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed =
    typeof value === 'number'
      ? value
      : Number.parseInt(String(value), 10);

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 23) {
    throw new NotifyServiceError(400, 'invalid_daily_hour', 'dailyHour must be an integer in 0..23');
  }

  return parsed;
}

function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function normalizeTimezone(mode: DeliveryMode, value: string | null | undefined): string | undefined {
  if (mode !== 'daily') {
    return undefined;
  }

  const timezone = (value || '').trim() || DEFAULT_DAILY_TIMEZONE;
  if (!isValidTimezone(timezone)) {
    throw new NotifyServiceError(400, 'invalid_timezone', 'Invalid timezone');
  }

  return timezone;
}

function normalizeDailyHour(mode: DeliveryMode, value: number | string | null | undefined): number | undefined {
  if (mode !== 'daily') {
    return undefined;
  }

  const parsed = parseDailyHour(value);
  return parsed ?? DEFAULT_DAILY_HOUR;
}

function getDailyTimezone(subscriber: SubscriberRecord): string {
  const timezone = subscriber.timezone || DEFAULT_DAILY_TIMEZONE;
  return isValidTimezone(timezone) ? timezone : DEFAULT_DAILY_TIMEZONE;
}

function getDailyHour(subscriber: SubscriberRecord): number {
  if (typeof subscriber.dailyHour === 'number' && subscriber.dailyHour >= 0 && subscriber.dailyHour <= 23) {
    return subscriber.dailyHour;
  }
  return DEFAULT_DAILY_HOUR;
}

function parseIsoDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getLocalDateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function getLocalHour(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hourPart = parts.find((part) => part.type === 'hour')?.value ?? '0';
  const parsed = Number.parseInt(hourPart, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getLocalTimeLabel(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

function getLocalDateLabel(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function getPostTimestamp(post: Post): number {
  const parsed = Date.parse(post.datetime);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getDefaultWindowStart(mode: DeliveryMode, now: Date): Date {
  if (mode === 'every_5h') {
    return new Date(now.getTime() - EVERY_5H_WINDOW_MS);
  }
  return new Date(now.getTime() - DEFAULT_DAILY_LOOKBACK_MS);
}

function getSubscriberWindowStart(subscriber: SubscriberRecord, now: Date): Date {
  const lastNotified = parseIsoDate(subscriber.lastNotifiedAt);
  if (lastNotified) {
    return lastNotified;
  }

  return getDefaultWindowStart(getSubscriberDeliveryMode(subscriber), now);
}

function getDigestDisplayTimezone(subscriber: SubscriberRecord): string {
  const timezone = subscriber.timezone || '';
  if (timezone && isValidTimezone(timezone)) {
    return timezone;
  }
  return 'UTC';
}

function isScheduledDue(subscriber: SubscriberRecord, now: Date): boolean {
  const mode = getSubscriberDeliveryMode(subscriber);

  if (mode === 'every_5h') {
    const lastNotified = parseIsoDate(subscriber.lastNotifiedAt);
    if (!lastNotified) return true;
    return now.getTime() - lastNotified.getTime() >= EVERY_5H_WINDOW_MS;
  }

  if (mode === 'daily') {
    const timezone = getDailyTimezone(subscriber);
    const hour = getDailyHour(subscriber);
    if (getLocalHour(now, timezone) < hour) {
      return false;
    }

    const lastNotified = parseIsoDate(subscriber.lastNotifiedAt);
    if (!lastNotified) {
      return true;
    }

    return getLocalDateKey(lastNotified, timezone) !== getLocalDateKey(now, timezone);
  }

  return false;
}

function isMatchingPreferences(
  subscriber: SubscriberRecord,
  target: { deliveryMode: DeliveryMode; timezone?: string; dailyHour?: number }
): boolean {
  const currentMode = getSubscriberDeliveryMode(subscriber);
  if (currentMode !== target.deliveryMode) {
    return false;
  }

  if (currentMode !== 'daily') {
    return true;
  }

  return getDailyTimezone(subscriber) === (target.timezone ?? DEFAULT_DAILY_TIMEZONE)
    && getDailyHour(subscriber) === (target.dailyHour ?? DEFAULT_DAILY_HOUR);
}

function isMatchingPendingPreferences(
  subscriber: SubscriberRecord,
  target: { deliveryMode: DeliveryMode; timezone?: string; dailyHour?: number }
): boolean {
  const pendingMode = subscriber.pendingDeliveryMode ?? getSubscriberDeliveryMode(subscriber);
  if (pendingMode !== target.deliveryMode) {
    return false;
  }

  if (pendingMode !== 'daily') {
    return true;
  }

  const pendingTimezone = subscriber.pendingTimezone ?? getDailyTimezone(subscriber);
  const pendingDailyHour = subscriber.pendingDailyHour ?? getDailyHour(subscriber);

  return pendingTimezone === (target.timezone ?? DEFAULT_DAILY_TIMEZONE)
    && pendingDailyHour === (target.dailyHour ?? DEFAULT_DAILY_HOUR);
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

async function updateSubscriberDeliveryState(
  kv: CloudflareKvClient,
  subscriber: SubscriberRecord,
  postId: string,
  timestamp = nowIso()
): Promise<void> {
  await upsertSubscriber(kv, {
    ...subscriber,
    deliveryMode: getSubscriberDeliveryMode(subscriber),
    updatedAt: timestamp,
    lastNotifiedAt: timestamp,
    lastNotifiedPostId: postId,
  });
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
  const nextAttemptAt = new Date(getNowMs() + delayMinutes * 60 * 1000).toISOString();

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
  if (notifyTestHooks?.loadMoodPost) {
    return notifyTestHooks.loadMoodPost(context, postId);
  }

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

async function loadLatestMoodPost(context: NotifyRequestContext): Promise<Post | null> {
  if (notifyTestHooks?.loadLatestMoodPost) {
    return notifyTestHooks.loadLatestMoodPost(context);
  }

  try {
    const result = (await getChannelInfo(
      {
        request: context.request,
        locals: context.locals,
      } as any,
      {
        type: 'list',
        skipCache: true,
      }
    )) as ChannelInfo;

    const posts = (result?.posts ?? [])
      .filter((post) => post?.id && post.type === 'text')
      .sort((a, b) => Number.parseInt(b.id, 10) - Number.parseInt(a.id, 10));

    return posts[0] ?? null;
  } catch (error) {
    console.error('Notify failed to load latest mood post:', error);
    return null;
  }
}

async function loadMoodPostsInWindow(
  context: NotifyRequestContext,
  input: { since: Date; until: Date }
): Promise<Post[]> {
  if (notifyTestHooks?.loadRecentMoodPosts) {
    return notifyTestHooks.loadRecentMoodPosts(context, input);
  }

  if (notifyTestHooks?.loadLatestMoodPost) {
    const latest = await notifyTestHooks.loadLatestMoodPost(context);
    return latest ? [latest] : [];
  }

  const sinceMs = input.since.getTime();
  const untilMs = input.until.getTime();
  if (!Number.isFinite(sinceMs) || !Number.isFinite(untilMs) || sinceMs >= untilMs) {
    return [];
  }

  const collected: Post[] = [];
  const seenIds = new Set<string>();
  let before = '';
  let pageCount = 0;
  let reachedWindowStart = false;

  while (
    pageCount < MAX_DIGEST_FETCH_PAGES
    && collected.length < MAX_DIGEST_FETCH_POSTS
  ) {
    pageCount += 1;

    let result: ChannelInfo;
    try {
      result = (await getChannelInfo(
        {
          request: context.request,
          locals: context.locals,
        } as any,
        {
          type: 'list',
          before,
          skipCache: true,
        }
      )) as ChannelInfo;
    } catch (error) {
      console.error('Notify failed to load mood list for digest:', error);
      break;
    }

    const pagePosts = (result?.posts ?? [])
      .filter((post) => post?.id && post.type === 'text')
      .sort((a, b) => Number.parseInt(b.id, 10) - Number.parseInt(a.id, 10));

    if (!pagePosts.length) {
      break;
    }

    for (const post of pagePosts) {
      if (seenIds.has(post.id)) {
        continue;
      }
      seenIds.add(post.id);

      const timestamp = getPostTimestamp(post);
      if (!timestamp) {
        continue;
      }

      if (timestamp <= sinceMs) {
        reachedWindowStart = true;
        break;
      }

      if (timestamp > untilMs) {
        continue;
      }

      collected.push(post);
      if (collected.length >= MAX_DIGEST_FETCH_POSTS) {
        break;
      }
    }

    const nextBefore = pagePosts[pagePosts.length - 1]?.id?.trim() || '';
    if (!nextBefore || nextBefore === before || reachedWindowStart) {
      break;
    }
    before = nextBefore;
  }

  return collected.sort((a, b) => getPostTimestamp(b) - getPostTimestamp(a));
}

function pickDigestPostsForSubscriber(
  posts: Post[],
  subscriber: SubscriberRecord,
  now: Date
): Post[] {
  const mode = getSubscriberDeliveryMode(subscriber);
  const lastNotified = parseIsoDate(subscriber.lastNotifiedAt);
  const lastNotifiedMs = lastNotified?.getTime() ?? Number.NEGATIVE_INFINITY;
  const windowStartMs = getSubscriberWindowStart(subscriber, now).getTime();
  const nowMs = now.getTime();

  if (mode === 'every_5h') {
    return posts.filter((post) => {
      const timestamp = getPostTimestamp(post);
      if (!timestamp) return false;
      if (timestamp > nowMs) return false;
      if (timestamp <= windowStartMs) return false;
      return timestamp > lastNotifiedMs;
    });
  }

  if (mode === 'daily') {
    const timezone = getDailyTimezone(subscriber);
    const todayKey = getLocalDateKey(now, timezone);

    return posts.filter((post) => {
      const timestamp = getPostTimestamp(post);
      if (!timestamp) return false;
      if (timestamp > nowMs || timestamp <= lastNotifiedMs) return false;
      return getLocalDateKey(new Date(timestamp), timezone) === todayKey;
    });
  }

  return [];
}

function normalizeAbsoluteUrl(value: string | undefined, baseUrl: string): string | undefined {
  const raw = (value || '').trim();
  if (!raw) return undefined;

  if (raw.startsWith('//')) {
    return `https:${raw}`;
  }

  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return undefined;
  }
}

async function loadChannelMeta(context: NotifyRequestContext): Promise<ChannelMeta | null> {
  if (notifyTestHooks) {
    if (notifyTestHooks.loadChannelMeta) {
      return notifyTestHooks.loadChannelMeta(context);
    }
    return null;
  }

  try {
    const result = (await getChannelInfo(
      {
        request: context.request,
        locals: context.locals,
      } as any,
      {
        type: 'list',
      }
    )) as ChannelInfo;

    if (!result || !('posts' in result)) {
      return null;
    }

    const siteUrl = getSiteUrl(context);
    const title = (result.title || '').trim() || undefined;
    const avatarUrl = normalizeAbsoluteUrl(result.avatar, siteUrl);

    return { title, avatarUrl };
  } catch (error) {
    console.error('Notify failed to load channel metadata:', error);
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
    channelMeta?: ChannelMeta | null;
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
  const channelTitle = input.channelMeta?.title || 'Mood Feed';
  const channelAvatarUrl = input.channelMeta?.avatarUrl;

  const email = buildMoodNotificationEmail({
    moodUrl,
    unsubscribeUrl,
    previewText: input.previewText,
    postId: input.post.id,
    channelTitle,
    channelAvatarUrl,
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

async function sendMoodDigestEmail(
  context: NotifyRequestContext,
  kv: CloudflareKvClient,
  input: {
    posts: Post[];
    subscriber: SubscriberRecord;
    channelMeta?: ChannelMeta | null;
    force: boolean;
  }
): Promise<{ sent: boolean; resendId?: string; latestPostId?: string }> {
  const config = getNotifyConfig(context);

  const uniquePosts = new Map<string, Post>();
  for (const post of input.posts) {
    if (!post?.id || post.type !== 'text') continue;
    if (!uniquePosts.has(post.id)) {
      uniquePosts.set(post.id, post);
    }
  }

  const orderedPosts = Array.from(uniquePosts.values())
    .sort((a, b) => getPostTimestamp(b) - getPostTimestamp(a))
    .slice(0, MAX_DIGEST_POSTS);

  if (!orderedPosts.length) {
    return { sent: false };
  }

  const postsToSend: Post[] = [];
  for (const post of orderedPosts) {
    if (!input.force) {
      const alreadySent = await hasBeenSent(kv, post.id, input.subscriber.emailHash);
      if (alreadySent) {
        continue;
      }
    }
    postsToSend.push(post);
  }

  if (!postsToSend.length) {
    return { sent: false };
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
  const unsubscribeUrl = `${siteUrl}/api/notify/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
  const channelTitle = input.channelMeta?.title || 'Mood Feed';
  const channelAvatarUrl = input.channelMeta?.avatarUrl;
  const mode = getSubscriberDeliveryMode(input.subscriber);
  const timezone = mode === 'daily'
    ? getDailyTimezone(input.subscriber)
    : getDigestDisplayTimezone(input.subscriber);

  const digestItems = postsToSend.map((post) => {
    const postDate = new Date(getPostTimestamp(post));
    return {
      postId: post.id,
      moodUrl: `${siteUrl}/mood/${post.id}`,
      previewText: getTextPreviewWithMedia(post),
      timeLabel: getLocalTimeLabel(postDate, timezone),
      dateLabel: getLocalDateLabel(postDate, timezone),
    };
  });

  const email = buildMoodDigestEmail({
    mode: mode === 'daily' ? 'daily' : 'every_5h',
    moodUrl: `${siteUrl}/mood`,
    unsubscribeUrl,
    channelTitle,
    channelAvatarUrl,
    posts: digestItems,
  });

  const latestPostId = postsToSend[0].id;
  const response = await sendEmailWithResend({
    apiKey: config.resendApiKey,
    from: getNotifyFromAddress(config),
    to: input.subscriber.email,
    replyTo: config.notifyReplyTo || undefined,
    subject: email.subject,
    html: email.html,
    text: email.text,
    idempotencyKey: `mood-digest-${mode}-${latestPostId}-${input.subscriber.emailHash}`,
  });

  await Promise.all(
    postsToSend.map(async (post) => {
      await markAsSent(kv, post.id, input.subscriber.emailHash, response.id);
      await kv.delete(retryKey(post.id, input.subscriber.emailHash));
    })
  );

  return {
    sent: true,
    resendId: response.id,
    latestPostId,
  };
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
  input: SubscriptionRequestInput
): Promise<SubscribeResult> {
  requireEmailSendingConfig(context);

  const email = normalizeEmail(input.email || '');
  if (!isValidEmail(email)) {
    throw new NotifyServiceError(400, 'invalid_email', 'Invalid email address');
  }

  const deliveryMode = normalizeDeliveryMode(input.deliveryMode);
  const timezone = normalizeTimezone(deliveryMode, input.timezone);
  const dailyHour = normalizeDailyHour(deliveryMode, input.dailyHour);

  const kv = createKvClient(context);
  const config = getNotifyConfig(context);
  const existing = await getSubscriberByEmail(kv, email);

  if (existing?.status === 'active' && isMatchingPreferences(existing, { deliveryMode, timezone, dailyHour })) {
    return {
      status: 'already_subscribed',
      email,
      deliveryMode,
    };
  }

  if (existing?.status === 'pending' && isMatchingPendingPreferences(existing, { deliveryMode, timezone, dailyHour })) {
    return {
      status: 'already_subscribed',
      email,
      deliveryMode,
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
    idempotencyKey: `subscribe-${hashEmail(email)}-${Math.floor(getNowMs() / 60_000)}`,
  });

  const now = nowIso();
  const emailHash = hashEmail(email);

  await upsertSubscriber(kv, {
    email,
    emailHash,
    status: existing?.status === 'active' ? 'active' : 'pending',
    deliveryMode: existing?.deliveryMode ?? deliveryMode,
    timezone: existing?.timezone ?? timezone,
    dailyHour: existing?.dailyHour ?? dailyHour,
    pendingDeliveryMode: deliveryMode,
    pendingTimezone: timezone,
    pendingDailyHour: dailyHour,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    confirmedAt: existing?.confirmedAt,
    lastConfirmSentAt: now,
    lastNotifiedAt: existing?.lastNotifiedAt,
    lastNotifiedPostId: existing?.lastNotifiedPostId,
  });

  return {
    status: 'confirmation_sent',
    email,
    deliveryMode,
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

  const deliveryMode = existing?.pendingDeliveryMode ?? existing?.deliveryMode ?? 'immediate';
  const timezone = deliveryMode === 'daily'
    ? (existing?.pendingTimezone ?? existing?.timezone ?? DEFAULT_DAILY_TIMEZONE)
    : undefined;
  const dailyHour = deliveryMode === 'daily'
    ? (existing?.pendingDailyHour ?? existing?.dailyHour ?? DEFAULT_DAILY_HOUR)
    : undefined;

  const record: SubscriberRecord = {
    email,
    emailHash,
    status: 'active',
    deliveryMode,
    timezone,
    dailyHour,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    confirmedAt: existing?.confirmedAt ?? now,
    lastConfirmSentAt: existing?.lastConfirmSentAt,
    lastNotifiedAt: existing?.lastNotifiedAt,
    lastNotifiedPostId: existing?.lastNotifiedPostId,
  };

  await upsertSubscriber(kv, record);

  return {
    status: 'subscribed',
    email,
    deliveryMode,
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
    deliveryMode: existing?.deliveryMode,
    timezone: existing?.timezone,
    dailyHour: existing?.dailyHour,
    pendingDeliveryMode: existing?.pendingDeliveryMode,
    pendingTimezone: existing?.pendingTimezone,
    pendingDailyHour: existing?.pendingDailyHour,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    confirmedAt: existing?.confirmedAt,
    lastConfirmSentAt: existing?.lastConfirmSentAt,
    lastNotifiedAt: existing?.lastNotifiedAt,
    lastNotifiedPostId: existing?.lastNotifiedPostId,
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
  options: { force?: boolean; deliveryModes?: DeliveryMode[] } = {}
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
  const previewText = getTextPreviewWithMedia(post);
  const channelMeta = await loadChannelMeta(context);
  const allowedModes = options.deliveryModes ? new Set(options.deliveryModes) : null;

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
    const mode = getSubscriberDeliveryMode(subscriber);
    if (allowedModes && !allowedModes.has(mode)) {
      result.skipped += 1;
      return;
    }

    try {
      const sendResult = await sendMoodEmail(context, kv, {
        post,
        previewText,
        subscriber,
        force: Boolean(options.force),
        channelMeta,
      });

      if (sendResult.sent) {
        result.sent += 1;
        await updateSubscriberDeliveryState(kv, subscriber, post.id);
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

export async function dispatchScheduledMoodNotifications(
  context: NotifyRequestContext
): Promise<ScheduledDispatchResult> {
  requireEmailSendingConfig(context);

  const kv = createKvClient(context);
  const latestPost = await loadLatestMoodPost(context);

  if (!latestPost) {
    return {
      postId: '',
      scanned: 0,
      due: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      skippedReason: 'no_mood_post',
    };
  }

  const subscribers = await listActiveSubscribers(kv);
  const scheduledSubscribers = subscribers.filter(
    (subscriber) => getSubscriberDeliveryMode(subscriber) !== 'immediate'
  );

  const now = getNowDate();
  const dueSubscribers = scheduledSubscribers.filter((subscriber) => {
    if (subscriber.lastNotifiedPostId === latestPost.id) {
      return false;
    }

    return isScheduledDue(subscriber, now);
  });

  const channelMeta = await loadChannelMeta(context);
  const result: ScheduledDispatchResult = {
    postId: latestPost.id,
    scanned: scheduledSubscribers.length,
    due: dueSubscribers.length,
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  if (!dueSubscribers.length) {
    return result;
  }

  let globalWindowStart = getSubscriberWindowStart(dueSubscribers[0], now);
  for (let index = 1; index < dueSubscribers.length; index += 1) {
    const candidate = getSubscriberWindowStart(dueSubscribers[index], now);
    if (candidate.getTime() < globalWindowStart.getTime()) {
      globalWindowStart = candidate;
    }
  }

  const candidatePosts = await loadMoodPostsInWindow(context, {
    since: globalWindowStart,
    until: now,
  });

  await runWithConcurrency(dueSubscribers, DEFAULT_SEND_CONCURRENCY, async (subscriber) => {
    const digestPosts = pickDigestPostsForSubscriber(candidatePosts, subscriber, now);
    if (!digestPosts.length) {
      result.skipped += 1;
      return;
    }

    try {
      const sendResult = await sendMoodDigestEmail(context, kv, {
        posts: digestPosts,
        subscriber,
        force: false,
        channelMeta,
      });

      if (sendResult.sent) {
        result.sent += 1;
        await updateSubscriberDeliveryState(
          kv,
          subscriber,
          sendResult.latestPostId ?? digestPosts[0].id
        );
      } else {
        result.skipped += 1;
      }
    } catch (error) {
      result.failed += 1;
      const message = error instanceof Error ? error.message : 'Unknown scheduled send error';
      const retryPostId = digestPosts[0]?.id || latestPost.id;
      await scheduleRetry(kv, {
        postId: retryPostId,
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
    .filter((entry) => new Date(entry.record.nextAttemptAt).getTime() <= getNowMs())
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
  const channelMeta = await loadChannelMeta(context);

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
      const previewText = getTextPreviewWithMedia(post);
      const sendResult = await sendMoodEmail(context, kv, {
        post,
        previewText,
        subscriber: activeSubscriber,
        force: false,
        channelMeta,
      });

      if (sendResult.sent) {
        output.sent += 1;
        await updateSubscriberDeliveryState(kv, activeSubscriber, post.id);
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

  return secureCompareText(bearer, secret) || secureCompareText(headerSecret, secret);
}
