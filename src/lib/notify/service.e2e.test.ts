import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  confirmMoodSubscription,
  dispatchMoodNotification,
  dispatchScheduledMoodNotifications,
  processNotifyRetries,
  requestMoodSubscription,
  setNotifyTestHooksForTesting,
  unsubscribeMoodSubscription,
  type NotifyRequestContext,
} from './service';
import { createNotifyToken, hashEmail } from './security';
import type { DeliveryMode, SubscriberRecord } from './types';

interface CapturedEmail {
  id: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
}

class ExternalApiMock {
  private originalFetch: typeof fetch | null = null;

  public readonly kv = new Map<string, string>();
  public readonly emails: CapturedEmail[] = [];
  private readonly resendFailures = new Map<string, number>();
  private emailCounter = 1;

  install(): void {
    this.originalFetch = globalThis.fetch;
    globalThis.fetch = this.fetch.bind(this) as typeof fetch;
  }

  restore(): void {
    if (this.originalFetch) {
      globalThis.fetch = this.originalFetch;
    }
  }

  clearEmails(): void {
    this.emails.length = 0;
  }

  failResendByIdempotency(idempotencyKey: string, times = 1): void {
    this.resendFailures.set(idempotencyKey, times);
  }

  private jsonResponse(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), {
      status,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  private async handleResend(request: Request): Promise<Response> {
    const idempotencyKey = request.headers.get('Idempotency-Key') ?? '';

    const remainingFailures = this.resendFailures.get(idempotencyKey) ?? 0;
    if (remainingFailures > 0) {
      this.resendFailures.set(idempotencyKey, remainingFailures - 1);
      return this.jsonResponse({ error: { message: 'Mock resend failure' } }, 500);
    }

    const body = await request.json() as {
      from: string;
      to: string[];
      subject: string;
      text: string;
      html: string;
    };

    const id = `email_${this.emailCounter++}`;
    this.emails.push({
      id,
      from: body.from,
      to: body.to?.[0] ?? '',
      subject: body.subject,
      text: body.text,
      html: body.html,
      idempotencyKey,
    });

    return this.jsonResponse({ id }, 200);
  }

  private async handleCloudflareKv(url: URL, request: Request): Promise<Response> {
    if (url.pathname.endsWith('/keys') && request.method === 'GET') {
      const prefix = url.searchParams.get('prefix') ?? '';
      const limitRaw = Number.parseInt(url.searchParams.get('limit') ?? '1000', 10);
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 1000;
      const cursorRaw = url.searchParams.get('cursor') ?? '';
      const offset = cursorRaw ? Number.parseInt(cursorRaw, 10) : 0;
      const safeOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0;

      const allMatched = Array.from(this.kv.keys())
        .filter((key) => key.startsWith(prefix))
        .sort();

      const batch = allMatched.slice(safeOffset, safeOffset + limit);
      const nextOffset = safeOffset + limit < allMatched.length ? String(safeOffset + limit) : '';

      return this.jsonResponse({
        result: batch.map((name) => ({ name })),
        result_info: nextOffset ? { cursor: nextOffset } : {},
      });
    }

    const valuesMarker = '/values/';
    const markerIndex = url.pathname.indexOf(valuesMarker);
    if (markerIndex === -1) {
      return new Response('Not Found', { status: 404 });
    }

    const encodedKey = url.pathname.slice(markerIndex + valuesMarker.length);
    const key = decodeURIComponent(encodedKey);

    if (request.method === 'GET') {
      if (!this.kv.has(key)) {
        return new Response('Not Found', { status: 404 });
      }
      return new Response(this.kv.get(key) ?? '', { status: 200 });
    }

    if (request.method === 'PUT') {
      const value = await request.text();
      this.kv.set(key, value);
      return this.jsonResponse({ success: true });
    }

    if (request.method === 'DELETE') {
      this.kv.delete(key);
      return this.jsonResponse({ success: true });
    }

    return new Response('Method Not Allowed', { status: 405 });
  }

  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);

    if (url.origin === 'https://api.resend.com' && url.pathname === '/emails') {
      return this.handleResend(request);
    }

    if (url.origin === 'https://api.cloudflare.com' && url.pathname.includes('/storage/kv/namespaces/')) {
      return this.handleCloudflareKv(url, request);
    }

    throw new Error(`Unexpected outbound request in test: ${request.method} ${request.url}`);
  }
}

const BASE_ENV = {
  RESEND_API_KEY: 're_test_key',
  NOTIFY_FROM_NAME: 'Mood',
  NOTIFY_FROM_EMAIL: 'notify@example.com',
  NOTIFY_REPLY_TO_EMAIL: 'reply@example.com',
  EMAIL_NOTIFY_SECRET: 'test_notify_secret',
  NOTIFY_DISPATCH_SECRET: 'dispatch_secret',
  PUBLIC_SITE_URL: 'https://example.com',
  CRON_SECRET: 'cron_secret',
  CLOUDFLARE_ACCOUNT_ID: 'cf_account',
  CLOUDFLARE_API_TOKEN: 'cf_api_token',
  CLOUDFLARE_NOTIFY_KV_NAMESPACE_ID: 'notify_kv_ns',
};

function createContext(path = '/api/test'): NotifyRequestContext {
  const env = { ...BASE_ENV };
  return {
    request: new Request(`https://example.com${path}`),
    locals: {
      runtime: { env },
      env,
    },
  };
}

function createPost(id: string, text = `Post ${id}`): any {
  return {
    id,
    title: `Post ${id}`,
    type: 'text',
    datetime: '2026-02-10T00:00:00.000Z',
    tags: [],
    text,
    content: `<p>${text}</p>`,
    reactions: [],
  };
}

function extractTokenFromEmailText(text: string): string {
  const tokenMatch = text.match(/token=([^\s]+)/);
  if (!tokenMatch) {
    throw new Error(`Unable to find token in email text: ${text}`);
  }
  return decodeURIComponent(tokenMatch[1]);
}

function readSubscriber(mock: ExternalApiMock, email: string): SubscriberRecord | null {
  const key = `notify:subscriber:${hashEmail(email.toLowerCase())}`;
  const raw = mock.kv.get(key);
  if (!raw) return null;
  return JSON.parse(raw) as SubscriberRecord;
}

function readRetryRaw(mock: ExternalApiMock, postId: string, email: string): string | null {
  const key = `notify:retry:${postId}:${hashEmail(email.toLowerCase())}`;
  return mock.kv.get(key) ?? null;
}

async function subscribeAndConfirm(
  mock: ExternalApiMock,
  context: NotifyRequestContext,
  email: string,
  options: { deliveryMode?: DeliveryMode; timezone?: string; dailyHour?: number } = {}
): Promise<void> {
  await requestMoodSubscription(context, {
    email,
    ...options,
  });

  const confirmationEmail = mock.emails[mock.emails.length - 1];
  const token = extractTokenFromEmailText(confirmationEmail.text);
  await confirmMoodSubscription(context, token);
}

describe('notify service integration e2e', () => {
  let mock: ExternalApiMock;

  beforeEach(() => {
    mock = new ExternalApiMock();
    mock.install();
    setNotifyTestHooksForTesting(null);
  });

  afterEach(() => {
    setNotifyTestHooksForTesting(null);
    mock.restore();
  });

  test('default subscription uses immediate mode after confirmation', async () => {
    const context = createContext('/api/notify/subscribe');

    const subscribeResult = await requestMoodSubscription(context, {
      email: 'user-immediate@example.com',
    });

    expect(subscribeResult.status).toBe('confirmation_sent');
    expect(subscribeResult.deliveryMode).toBe('immediate');
    expect(mock.emails.length).toBe(1);

    const token = extractTokenFromEmailText(mock.emails[0].text);
    const confirmResult = await confirmMoodSubscription(context, token);

    expect(confirmResult.status).toBe('subscribed');
    expect(confirmResult.deliveryMode).toBe('immediate');

    const subscriber = readSubscriber(mock, 'user-immediate@example.com');
    expect(subscriber?.status).toBe('active');
    expect(subscriber?.deliveryMode).toBe('immediate');
  });

  test('pending subscription with same preferences does not send duplicate confirmations', async () => {
    const context = createContext('/api/notify/subscribe');
    const email = 'pending-user@example.com';

    const firstRequest = await requestMoodSubscription(context, {
      email,
      deliveryMode: 'daily',
      timezone: 'Asia/Shanghai',
      dailyHour: 9,
    });

    expect(firstRequest.status).toBe('confirmation_sent');
    expect(mock.emails.length).toBe(1);

    const secondRequest = await requestMoodSubscription(context, {
      email,
      deliveryMode: 'daily',
      timezone: 'Asia/Shanghai',
      dailyHour: 9,
    });

    expect(secondRequest.status).toBe('already_subscribed');
    expect(mock.emails.length).toBe(1);

    const subscriber = readSubscriber(mock, email);
    expect(subscriber?.status).toBe('pending');
    expect(subscriber?.pendingDeliveryMode).toBe('daily');
    expect(subscriber?.pendingTimezone).toBe('Asia/Shanghai');
    expect(subscriber?.pendingDailyHour).toBe(9);
  });

  test('instant delivery mode alias is normalized to immediate', async () => {
    const context = createContext('/api/notify/subscribe');

    const subscribeResult = await requestMoodSubscription(context, {
      email: 'user-instant@example.com',
      deliveryMode: 'instant',
    });

    expect(subscribeResult.status).toBe('confirmation_sent');
    expect(subscribeResult.deliveryMode).toBe('immediate');
    expect(mock.emails.length).toBe(1);

    const token = extractTokenFromEmailText(mock.emails[0].text);
    const confirmResult = await confirmMoodSubscription(context, token);

    expect(confirmResult.status).toBe('subscribed');
    expect(confirmResult.deliveryMode).toBe('immediate');

    const subscriber = readSubscriber(mock, 'user-instant@example.com');
    expect(subscriber?.status).toBe('active');
    expect(subscriber?.deliveryMode).toBe('immediate');
  });

  test('active subscriber can change delivery mode via reconfirmation', async () => {
    const context = createContext('/api/notify/subscribe');
    const email = 'user-change-mode@example.com';

    await subscribeAndConfirm(mock, context, email, { deliveryMode: 'immediate' });

    await requestMoodSubscription(context, {
      email,
      deliveryMode: 'daily',
      timezone: 'Asia/Shanghai',
      dailyHour: 10,
    });

    const beforeConfirm = readSubscriber(mock, email);
    expect(beforeConfirm?.status).toBe('active');
    expect(beforeConfirm?.deliveryMode).toBe('immediate');
    expect(beforeConfirm?.pendingDeliveryMode).toBe('daily');

    const token = extractTokenFromEmailText(mock.emails[mock.emails.length - 1].text);
    const confirmResult = await confirmMoodSubscription(context, token);

    expect(confirmResult.deliveryMode).toBe('daily');

    const afterConfirm = readSubscriber(mock, email);
    expect(afterConfirm?.status).toBe('active');
    expect(afterConfirm?.deliveryMode).toBe('daily');
    expect(afterConfirm?.timezone).toBe('Asia/Shanghai');
    expect(afterConfirm?.dailyHour).toBe(10);
  });

  test('webhook dispatch can target immediate subscribers only', async () => {
    const context = createContext('/api/telegram-webhook');

    await subscribeAndConfirm(mock, context, 'immediate-user@example.com', {
      deliveryMode: 'immediate',
    });

    await subscribeAndConfirm(mock, context, 'daily-user@example.com', {
      deliveryMode: 'daily',
      timezone: 'Asia/Shanghai',
      dailyHour: 9,
    });

    mock.clearEmails();

    const post = createPost('500', 'Immediate only');
    setNotifyTestHooksForTesting({
      loadMoodPost: async (_context, postId) => (postId === post.id ? post : null),
    });

    const result = await dispatchMoodNotification(context, '500', {
      deliveryModes: ['immediate'],
    });

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    expect(mock.emails.length).toBe(1);
    expect(mock.emails[0].to).toBe('immediate-user@example.com');

    const immediateSubscriber = readSubscriber(mock, 'immediate-user@example.com');
    const dailySubscriber = readSubscriber(mock, 'daily-user@example.com');

    expect(immediateSubscriber?.lastNotifiedPostId).toBe('500');
    expect(dailySubscriber?.lastNotifiedPostId).toBeUndefined();
  });

  test('every_5h mode does not resend when there is no new post', async () => {
    const context = createContext('/api/notify/schedule');
    const email = 'every5h-no-repeat@example.com';

    await subscribeAndConfirm(mock, context, email, {
      deliveryMode: 'every_5h',
    });

    mock.clearEmails();

    let now = new Date('2026-02-10T00:00:00.000Z');
    let latestPost = createPost('200', 'First post');

    setNotifyTestHooksForTesting({
      now: () => now,
      loadLatestMoodPost: async () => latestPost,
    });

    const firstRun = await dispatchScheduledMoodNotifications(context);
    expect(firstRun.sent).toBe(1);

    now = new Date('2026-02-10T06:00:00.000Z');
    const secondRun = await dispatchScheduledMoodNotifications(context);
    expect(secondRun.sent).toBe(0);
    expect(secondRun.due).toBe(0);
    expect(mock.emails.length).toBe(1);

    latestPost = createPost('201', 'New post after interval');
    const thirdRun = await dispatchScheduledMoodNotifications(context);
    expect(thirdRun.sent).toBe(1);
    expect(mock.emails.length).toBe(2);
  });

  test('every_5h mode respects interval even when new post arrives early', async () => {
    const context = createContext('/api/notify/schedule');
    const email = 'every5h-interval@example.com';

    await subscribeAndConfirm(mock, context, email, {
      deliveryMode: 'every_5h',
    });

    mock.clearEmails();

    let now = new Date('2026-02-10T00:00:00.000Z');
    let latestPost = createPost('300', 'Initial post');

    setNotifyTestHooksForTesting({
      now: () => now,
      loadLatestMoodPost: async () => latestPost,
    });

    const firstRun = await dispatchScheduledMoodNotifications(context);
    expect(firstRun.sent).toBe(1);

    now = new Date('2026-02-10T02:00:00.000Z');
    latestPost = createPost('301', 'Too early');

    const secondRun = await dispatchScheduledMoodNotifications(context);
    expect(secondRun.sent).toBe(0);
    expect(secondRun.due).toBe(0);

    now = new Date('2026-02-10T05:01:00.000Z');
    const thirdRun = await dispatchScheduledMoodNotifications(context);
    expect(thirdRun.sent).toBe(1);
    expect(mock.emails.length).toBe(2);
  });

  test('daily mode sends only after local hour and only once per local day', async () => {
    const context = createContext('/api/notify/schedule');
    const email = 'daily-mode@example.com';

    await subscribeAndConfirm(mock, context, email, {
      deliveryMode: 'daily',
      timezone: 'Asia/Shanghai',
      dailyHour: 9,
    });

    mock.clearEmails();

    let now = new Date('2026-02-10T00:00:00.000Z'); // 08:00 Asia/Shanghai
    let latestPost = createPost('400', 'Morning update');

    setNotifyTestHooksForTesting({
      now: () => now,
      loadLatestMoodPost: async () => latestPost,
    });

    const beforeHour = await dispatchScheduledMoodNotifications(context);
    expect(beforeHour.sent).toBe(0);

    now = new Date('2026-02-10T02:00:00.000Z'); // 10:00 Asia/Shanghai
    const firstDaily = await dispatchScheduledMoodNotifications(context);
    expect(firstDaily.sent).toBe(1);

    now = new Date('2026-02-10T06:00:00.000Z'); // same local day
    latestPost = createPost('401', 'Afternoon update');
    const sameDay = await dispatchScheduledMoodNotifications(context);
    expect(sameDay.sent).toBe(0);

    now = new Date('2026-02-11T02:00:00.000Z'); // next local day
    const nextDay = await dispatchScheduledMoodNotifications(context);
    expect(nextDay.sent).toBe(1);

    expect(mock.emails.length).toBe(2);
  });

  test('failed immediate send is retried and succeeds later', async () => {
    const context = createContext('/api/notify/dispatch');
    const email = 'retry-user@example.com';
    const post = createPost('700', 'Retry me');

    await subscribeAndConfirm(mock, context, email, {
      deliveryMode: 'immediate',
    });

    mock.clearEmails();

    let now = new Date('2026-02-10T00:00:00.000Z');
    setNotifyTestHooksForTesting({
      now: () => now,
      loadMoodPost: async (_context, postId) => (postId === post.id ? post : null),
    });

    const emailHash = hashEmail(email);
    mock.failResendByIdempotency(`mood-${post.id}-${emailHash}`, 1);

    const firstDispatch = await dispatchMoodNotification(context, post.id, {
      deliveryModes: ['immediate'],
    });

    expect(firstDispatch.sent).toBe(0);
    expect(firstDispatch.failed).toBe(1);
    expect(readRetryRaw(mock, post.id, email)).not.toBeNull();

    now = new Date('2026-02-10T00:06:00.000Z');
    const retryResult = await processNotifyRetries(context);

    expect(retryResult.sent).toBe(1);
    expect(retryResult.failed).toBe(0);
    expect(readRetryRaw(mock, post.id, email)).toBeNull();
    expect(mock.emails.length).toBe(1);
  });

  test('unsubscribed users are excluded from dispatch', async () => {
    const context = createContext('/api/notify/dispatch');
    const email = 'unsub-user@example.com';

    await subscribeAndConfirm(mock, context, email, {
      deliveryMode: 'immediate',
    });

    const unsubscribeToken = createNotifyToken(
      {
        action: 'unsubscribe',
        email,
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      BASE_ENV.EMAIL_NOTIFY_SECRET
    );
    await unsubscribeMoodSubscription(context, unsubscribeToken);

    mock.clearEmails();

    const post = createPost('900', 'Should not send');
    setNotifyTestHooksForTesting({
      loadMoodPost: async (_context, postId) => (postId === post.id ? post : null),
    });

    const result = await dispatchMoodNotification(context, post.id, {
      deliveryModes: ['immediate'],
    });

    expect(result.subscribers).toBe(0);
    expect(result.sent).toBe(0);
    expect(mock.emails.length).toBe(0);
  });

  test('invalid delivery config is rejected', async () => {
    const context = createContext('/api/notify/subscribe');

    await expect(
      requestMoodSubscription(context, {
        email: 'invalid-mode@example.com',
        deliveryMode: 'weekly',
      })
    ).rejects.toMatchObject({
      code: 'invalid_delivery_mode',
      status: 400,
    });

    await expect(
      requestMoodSubscription(context, {
        email: 'invalid-hour@example.com',
        deliveryMode: 'daily',
        timezone: 'Asia/Shanghai',
        dailyHour: 99,
      })
    ).rejects.toMatchObject({
      code: 'invalid_daily_hour',
      status: 400,
    });

    await expect(
      requestMoodSubscription(context, {
        email: 'invalid-timezone@example.com',
        deliveryMode: 'daily',
        timezone: 'Mars/OlympusMons',
      })
    ).rejects.toMatchObject({
      code: 'invalid_timezone',
      status: 400,
    });
  });
});
