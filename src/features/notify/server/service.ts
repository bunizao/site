import { createHash } from 'node:crypto';
import type { ChannelInfo, Post } from '@/features/mood/server/telegram-source';
import { getChannelInfo } from '@/features/mood/server/telegram-source';
import { getRelatedLinks, getTextPreviewHtml, getTextPreviewWithMedia } from '@/features/mood/shared/utils';
import { readPublicEnv } from '@/lib/runtime/env';
import { getNotifyConfig, getNotifyFromAddress, requireConfigValue } from './env';
import { CloudflareD1Client } from './d1';
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
  buildSubscribeWelcomeEmail,
  buildUnsubscribeNoticeEmail,
} from './templates';
import type {
  ConfirmResult,
  DeliveryMode,
  DispatchResult,
  NotifyAuditEventType,
  NotifyAuditRecord,
  RetryProcessResult,
  RetryRecord,
  ScheduledDispatchResult,
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

const SUBSCRIBE_TOKEN_TTL_SECONDS = 24 * 60 * 60;
const UNSUBSCRIBE_TOKEN_TTL_SECONDS = 180 * 24 * 60 * 60;
const SENT_RECORD_TTL_SECONDS = 180 * 24 * 60 * 60;
const SENT_RECORD_TTL_MS = SENT_RECORD_TTL_SECONDS * 1000;

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

interface SubscriberRow {
  email: string;
  email_hash: string;
  status: 'pending' | 'active' | 'unsubscribed';
  delivery_mode: DeliveryMode | null;
  timezone: string | null;
  daily_hour: number | null;
  pending_delivery_mode: DeliveryMode | null;
  pending_timezone: string | null;
  pending_daily_hour: number | null;
  last_notified_at: string | null;
  last_notified_post_id: string | null;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
  last_confirm_sent_at: string | null;
}

interface RetryRow {
  post_id: string;
  email: string;
  email_hash: string;
  attempt: number;
  created_at: string;
  updated_at: string;
  next_attempt_at: string;
  last_error: string;
}

interface EmailRelatedLink {
  url: string;
  type: 'link' | 'image';
}

const SUBSCRIBER_COLUMNS = `
  email,
  email_hash,
  status,
  delivery_mode,
  timezone,
  daily_hour,
  pending_delivery_mode,
  pending_timezone,
  pending_daily_hour,
  last_notified_at,
  last_notified_post_id,
  created_at,
  updated_at,
  confirmed_at,
  last_confirm_sent_at
`;

function nullableText(value: string | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function nullableInt(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function parseNullableInt(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

function mapSubscriberRow(row: SubscriberRow): SubscriberRecord {
  return {
    email: row.email,
    emailHash: row.email_hash,
    status: row.status,
    deliveryMode: row.delivery_mode ?? undefined,
    timezone: row.timezone ?? undefined,
    dailyHour: parseNullableInt(row.daily_hour),
    pendingDeliveryMode: row.pending_delivery_mode ?? undefined,
    pendingTimezone: row.pending_timezone ?? undefined,
    pendingDailyHour: parseNullableInt(row.pending_daily_hour),
    lastNotifiedAt: row.last_notified_at ?? undefined,
    lastNotifiedPostId: row.last_notified_post_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    confirmedAt: row.confirmed_at ?? undefined,
    lastConfirmSentAt: row.last_confirm_sent_at ?? undefined,
  };
}

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

function getSiteUrl(context: NotifyRequestContext): string {
  const config = getNotifyConfig(context);
  if (config.siteUrl) {
    return config.siteUrl;
  }
  return new URL(context.request.url).origin;
}

function truncateText(value: string | null | undefined, maxLength: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function readClientIp(request: Request): string {
  const candidates = [
    request.headers.get('cf-connecting-ip'),
    request.headers.get('x-forwarded-for')?.split(',')[0],
    request.headers.get('x-real-ip'),
  ];

  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value) {
      return value;
    }
  }

  return '';
}

function detectNotifyRequestSource(request: Request): string {
  const method = request.method.toUpperCase();
  const userAgent = (request.headers.get('user-agent') || '').toLowerCase();
  const purpose = (request.headers.get('purpose') || request.headers.get('x-purpose') || '').toLowerCase();
  const secPurpose = (request.headers.get('sec-purpose') || '').toLowerCase();
  const secFetchMode = (request.headers.get('sec-fetch-mode') || '').toLowerCase();
  const secFetchUser = (request.headers.get('sec-fetch-user') || '').toLowerCase();

  if (method === 'POST' && userAgent.includes('resend')) {
    return 'one_click_provider';
  }

  if (purpose.includes('prefetch') || secPurpose.includes('prefetch')) {
    return 'prefetch';
  }

  if (userAgent.includes('googleimageproxy') || userAgent.includes('outlook') || userAgent.includes('safelinks')) {
    return 'link_scanner';
  }

  if (
    userAgent.includes('bot')
    || userAgent.includes('crawler')
    || userAgent.includes('spider')
    || userAgent.includes('headless')
  ) {
    return 'bot';
  }

  if (method === 'POST' && (secFetchMode === 'navigate' || secFetchUser === '?1')) {
    return 'user_click';
  }

  if (method === 'GET' && (secFetchMode === 'navigate' || secFetchUser === '?1')) {
    return 'confirm_page';
  }

  if (method === 'POST') {
    return 'post_request';
  }

  return 'unknown';
}

function createD1Client(context: NotifyRequestContext): CloudflareD1Client {
  const config = getNotifyConfig(context);
  requireConfigValue(config.cloudflareAccountId, 'CLOUDFLARE_ACCOUNT_ID');
  requireConfigValue(config.cloudflareApiToken, 'CLOUDFLARE_API_TOKEN');
  requireConfigValue(config.cloudflareNotifyD1DatabaseId, 'CLOUDFLARE_NOTIFY_D1_DATABASE_ID');

  return new CloudflareD1Client({
    accountId: config.cloudflareAccountId,
    apiToken: config.cloudflareApiToken,
    databaseId: config.cloudflareNotifyD1DatabaseId,
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
  d1: CloudflareD1Client,
  email: string
): Promise<SubscriberRecord | null> {
  return getSubscriberByEmailHash(d1, hashEmail(email));
}

async function getSubscriberByEmailHash(
  d1: CloudflareD1Client,
  emailHash: string
): Promise<SubscriberRecord | null> {
  const row = await d1.first<SubscriberRow>(
    `SELECT ${SUBSCRIBER_COLUMNS} FROM notify_subscribers WHERE email_hash = ? LIMIT 1`,
    [emailHash]
  );
  return row ? mapSubscriberRow(row) : null;
}

async function upsertSubscriber(
  d1: CloudflareD1Client,
  record: SubscriberRecord
): Promise<void> {
  await d1.run(
    `INSERT INTO notify_subscribers (
      email,
      email_hash,
      status,
      delivery_mode,
      timezone,
      daily_hour,
      pending_delivery_mode,
      pending_timezone,
      pending_daily_hour,
      last_notified_at,
      last_notified_post_id,
      created_at,
      updated_at,
      confirmed_at,
      last_confirm_sent_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(email_hash) DO UPDATE SET
      email = excluded.email,
      status = excluded.status,
      delivery_mode = excluded.delivery_mode,
      timezone = excluded.timezone,
      daily_hour = excluded.daily_hour,
      pending_delivery_mode = excluded.pending_delivery_mode,
      pending_timezone = excluded.pending_timezone,
      pending_daily_hour = excluded.pending_daily_hour,
      last_notified_at = excluded.last_notified_at,
      last_notified_post_id = excluded.last_notified_post_id,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      confirmed_at = excluded.confirmed_at,
      last_confirm_sent_at = excluded.last_confirm_sent_at`,
    [
      record.email,
      record.emailHash,
      record.status,
      nullableText(record.deliveryMode),
      nullableText(record.timezone),
      nullableInt(record.dailyHour),
      nullableText(record.pendingDeliveryMode),
      nullableText(record.pendingTimezone),
      nullableInt(record.pendingDailyHour),
      nullableText(record.lastNotifiedAt),
      nullableText(record.lastNotifiedPostId),
      record.createdAt,
      record.updatedAt,
      nullableText(record.confirmedAt),
      nullableText(record.lastConfirmSentAt),
    ]
  );
}

async function insertAuditRecord(
  d1: CloudflareD1Client,
  record: NotifyAuditRecord
): Promise<void> {
  await d1.run(
    `INSERT INTO notify_audit (
      event_type,
      email_hash,
      email,
      source,
      user_agent,
      ip_hash,
      token_hash,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.eventType,
      record.emailHash,
      record.email,
      record.source,
      nullableText(record.userAgent),
      nullableText(record.ipHash),
      nullableText(record.tokenHash),
      record.createdAt,
    ]
  );
}

async function recordAuditEvent(
  context: NotifyRequestContext,
  d1: CloudflareD1Client,
  input: {
    eventType: NotifyAuditEventType;
    email: string;
    emailHash: string;
    token?: string;
  }
): Promise<void> {
  const config = getNotifyConfig(context);
  const userAgent = truncateText(context.request.headers.get('user-agent'), 500);
  const ip = readClientIp(context.request);
  const ipHash = ip && config.tokenSecret ? sha256(`${config.tokenSecret}:${ip}`) : null;
  const tokenHash = input.token ? sha256(input.token) : null;

  try {
    await insertAuditRecord(d1, {
      eventType: input.eventType,
      email: input.email,
      emailHash: input.emailHash,
      source: detectNotifyRequestSource(context.request),
      userAgent: userAgent ?? undefined,
      ipHash: ipHash ?? undefined,
      tokenHash: tokenHash ?? undefined,
      createdAt: nowIso(),
    });
  } catch (error) {
    console.error('Notify audit write failed:', error);
  }
}

async function updateSubscriberDeliveryState(
  d1: CloudflareD1Client,
  subscriber: SubscriberRecord,
  postId: string,
  timestamp = nowIso()
): Promise<void> {
  await upsertSubscriber(d1, {
    ...subscriber,
    deliveryMode: getSubscriberDeliveryMode(subscriber),
    updatedAt: timestamp,
    lastNotifiedAt: timestamp,
    lastNotifiedPostId: postId,
  });
}

async function listActiveSubscribers(d1: CloudflareD1Client): Promise<SubscriberRecord[]> {
  const rows = await d1.query<SubscriberRow>(
    `SELECT ${SUBSCRIBER_COLUMNS}
     FROM notify_subscribers
     WHERE status = ?
     ORDER BY email_hash
     LIMIT 10000`,
    ['active']
  );

  return rows.map((row) => mapSubscriberRow(row));
}

function normalizePostId(value: string): string {
  return value.trim();
}

function getRetryDelayMinutes(attempt: number): number {
  const index = Math.max(0, Math.min(attempt - 1, RETRY_DELAYS_MINUTES.length - 1));
  return RETRY_DELAYS_MINUTES[index];
}

async function scheduleRetry(
  d1: CloudflareD1Client,
  input: {
    postId: string;
    email: string;
    emailHash: string;
    lastError: string;
  }
): Promise<{ scheduled: boolean; attempt: number }> {
  const existingRow = await d1.first<RetryRow>(
    `SELECT
      post_id,
      email,
      email_hash,
      attempt,
      created_at,
      updated_at,
      next_attempt_at,
      last_error
    FROM notify_retries
    WHERE post_id = ? AND email_hash = ?
    LIMIT 1`,
    [input.postId, input.emailHash]
  );

  const existing: RetryRecord | null = existingRow
    ? {
      postId: existingRow.post_id,
      email: existingRow.email,
      emailHash: existingRow.email_hash,
      attempt: parseNullableInt(existingRow.attempt) ?? 0,
      createdAt: existingRow.created_at,
      updatedAt: existingRow.updated_at,
      nextAttemptAt: existingRow.next_attempt_at,
      lastError: existingRow.last_error,
    }
    : null;

  const attempt = (existing?.attempt ?? 0) + 1;
  const createdAt = existing?.createdAt ?? nowIso();
  const updatedAt = nowIso();

  if (attempt > MAX_RETRY_ATTEMPTS) {
    await d1.run(
      `INSERT INTO notify_dead_letters (
        post_id,
        email,
        email_hash,
        attempt,
        created_at,
        updated_at,
        last_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.postId,
        input.email,
        input.emailHash,
        attempt,
        createdAt,
        updatedAt,
        input.lastError.slice(0, 500),
      ]
    );
    await deleteRetryRecord(d1, input.postId, input.emailHash);
    return { scheduled: false, attempt };
  }

  const delayMinutes = getRetryDelayMinutes(attempt);
  const nextAttemptAt = new Date(getNowMs() + delayMinutes * 60 * 1000).toISOString();

  await d1.run(
    `INSERT INTO notify_retries (
      post_id,
      email,
      email_hash,
      attempt,
      created_at,
      updated_at,
      next_attempt_at,
      last_error
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(post_id, email_hash) DO UPDATE SET
      email = excluded.email,
      attempt = excluded.attempt,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      next_attempt_at = excluded.next_attempt_at,
      last_error = excluded.last_error`,
    [
      input.postId,
      input.email,
      input.emailHash,
      attempt,
      createdAt,
      updatedAt,
      nextAttemptAt,
      input.lastError.slice(0, 500),
    ]
  );
  return { scheduled: true, attempt };
}

async function deleteRetryRecord(
  d1: CloudflareD1Client,
  postId: string,
  emailHash: string
): Promise<void> {
  await d1.run(
    'DELETE FROM notify_retries WHERE post_id = ? AND email_hash = ?',
    [postId, emailHash]
  );
}

async function markAsSent(
  d1: CloudflareD1Client,
  postId: string,
  emailHash: string,
  resendId?: string
): Promise<void> {
  await d1.run(
    `INSERT INTO notify_sent (
      post_id,
      email_hash,
      sent_at,
      resend_id
    )
    VALUES (?, ?, ?, ?)
    ON CONFLICT(post_id, email_hash) DO UPDATE SET
      sent_at = excluded.sent_at,
      resend_id = excluded.resend_id`,
    [postId, emailHash, nowIso(), nullableText(resendId)]
  );
}

async function hasBeenSent(
  d1: CloudflareD1Client,
  postId: string,
  emailHash: string
): Promise<boolean> {
  const row = await d1.first<{ sent_at: string | null }>(
    'SELECT sent_at FROM notify_sent WHERE post_id = ? AND email_hash = ? LIMIT 1',
    [postId, emailHash]
  );

  const sentAt = row?.sent_at;
  if (!sentAt) {
    return false;
  }

  const sentAtMs = Date.parse(sentAt);
  if (!Number.isFinite(sentAtMs)) {
    return true;
  }

  if (sentAtMs < (getNowMs() - SENT_RECORD_TTL_MS)) {
    await d1.run('DELETE FROM notify_sent WHERE post_id = ? AND email_hash = ?', [postId, emailHash]);
    return false;
  }

  return true;
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

function buildListUnsubscribeHeaders(unsubscribeUrl: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

async function sendAdminTelegramMessage(context: NotifyRequestContext, text: string): Promise<void> {
  const config = getNotifyConfig(context);
  const botToken = config.telegramBotToken.trim();
  const chatId = config.notifyAdminTelegramChatId.trim();

  if (!botToken || !chatId) {
    return;
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Telegram admin notify failed: ${response.status} ${body}`.trim());
  }
}

async function sendWelcomeEmail(
  context: NotifyRequestContext,
  input: {
    email: string;
    deliveryMode: DeliveryMode;
  }
): Promise<void> {
  const config = getNotifyConfig(context);
  const siteUrl = getSiteUrl(context);
  const unsubscribeToken = createNotifyToken(
    {
      action: 'unsubscribe',
      email: input.email,
      exp: unixNow() + UNSUBSCRIBE_TOKEN_TTL_SECONDS,
    },
    config.tokenSecret
  );
  const unsubscribeUrl = `${siteUrl}/api/notify/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
  const email = buildSubscribeWelcomeEmail({
    moodUrl: `${siteUrl}/mood`,
    unsubscribeUrl,
    deliveryMode: input.deliveryMode,
  });

  await sendEmailWithResend({
    apiKey: config.resendApiKey,
    from: getNotifyFromAddress(config),
    to: input.email,
    replyTo: config.notifyReplyTo || undefined,
    subject: email.subject,
    html: email.html,
    text: email.text,
    idempotencyKey: `welcome-${hashEmail(input.email)}-${input.deliveryMode}`,
    headers: buildListUnsubscribeHeaders(unsubscribeUrl),
  });
}

async function sendUnsubscribeNoticeEmail(
  context: NotifyRequestContext,
  emailAddress: string
): Promise<void> {
  const config = getNotifyConfig(context);
  const siteUrl = getSiteUrl(context);
  const email = buildUnsubscribeNoticeEmail({
    siteUrl,
    subscribeUrl: `${siteUrl}/mood?subscribe=1`,
  });

  await sendEmailWithResend({
    apiKey: config.resendApiKey,
    from: getNotifyFromAddress(config),
    to: emailAddress,
    replyTo: config.notifyReplyTo || undefined,
    subject: email.subject,
    html: email.html,
    text: email.text,
    idempotencyKey: `unsubscribe-${hashEmail(emailAddress)}`,
  });
}
async function notifyAdminEvent(
  context: NotifyRequestContext,
  input: {
    event: 'subscription_confirmed' | 'unsubscribed';
    email: string;
    deliveryMode?: DeliveryMode;
  }
): Promise<void> {
  const siteUrl = getSiteUrl(context);
  const source = detectNotifyRequestSource(context.request);
  const lines = [
    `Mood notify ${input.event === 'subscription_confirmed' ? 'subscribed' : 'unsubscribed'}`,
    `Email: ${input.email}`,
    `Source: ${source}`,
  ];

  if (input.deliveryMode) {
    lines.push(`Mode: ${input.deliveryMode}`);
  }

  lines.push(`Site: ${siteUrl}`);

  try {
    await sendAdminTelegramMessage(context, lines.join('\n'));
  } catch (error) {
    console.error('Notify admin message failed:', error);
  }
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

function getHdImageOrigin(locals: any): string {
  const hdImageUrl = readPublicEnv(locals, 'HD_IMAGE_URL');
  if (!hdImageUrl) return '';

  try {
    return new URL(hdImageUrl).origin.toLowerCase();
  } catch {
    return '';
  }
}

function toEmailImageUrl(
  value: string | undefined,
  siteUrl: string,
  locals?: any
): string | undefined {
  const absoluteUrl = normalizeAbsoluteUrl(value, siteUrl);
  if (!absoluteUrl) return undefined;

  let imageOrigin: string;
  try {
    imageOrigin = new URL(absoluteUrl).origin.toLowerCase();
  } catch {
    return absoluteUrl;
  }

  const hdImageOrigin = getHdImageOrigin(locals);
  if (hdImageOrigin && imageOrigin === hdImageOrigin) {
    return absoluteUrl;
  }

  let siteOrigin: string;
  try {
    siteOrigin = new URL(siteUrl).origin.toLowerCase();
  } catch {
    return absoluteUrl;
  }

  const staticPrefix = `${siteOrigin}/static/`;
  if (absoluteUrl.startsWith(staticPrefix) || imageOrigin === siteOrigin) {
    return absoluteUrl;
  }

  return `${staticPrefix}${absoluteUrl}`;
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
  d1: CloudflareD1Client,
  input: {
    post: Post;
    previewText: string;
    previewHtml: string;
    relatedLinks?: EmailRelatedLink[];
    subscriber: SubscriberRecord;
    force: boolean;
    channelMeta?: ChannelMeta | null;
  }
): Promise<{ sent: boolean; resendId?: string }> {
  const config = getNotifyConfig(context);
  const postId = input.post.id;

  if (!input.force) {
    const alreadySent = await hasBeenSent(d1, postId, input.subscriber.emailHash);
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
  const channelAvatarUrl = toEmailImageUrl(input.channelMeta?.avatarUrl, siteUrl, context.locals);
  const relatedLinks = input.relatedLinks?.length
    ? input.relatedLinks
    : getRelatedLinks(input.post, {
      baseUrl: siteUrl,
      maxCount: 8,
      excludeInlineAnchors: true,
      excludeInternalLinks: true,
    });

  const email = buildMoodNotificationEmail({
    moodUrl,
    unsubscribeUrl,
    previewText: input.previewText,
    previewHtml: input.previewHtml,
    relatedLinks,
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
    headers: buildListUnsubscribeHeaders(unsubscribeUrl),
  });

  await markAsSent(d1, postId, input.subscriber.emailHash, response.id);
  await deleteRetryRecord(d1, postId, input.subscriber.emailHash);

  return { sent: true, resendId: response.id };
}

async function sendMoodDigestEmail(
  context: NotifyRequestContext,
  d1: CloudflareD1Client,
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
      const alreadySent = await hasBeenSent(d1, post.id, input.subscriber.emailHash);
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
  const channelAvatarUrl = toEmailImageUrl(input.channelMeta?.avatarUrl, siteUrl, context.locals);
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
      previewHtml: getTextPreviewHtml(post, { preserveBookmarks: true }),
      relatedLinks: getRelatedLinks(post, {
        baseUrl: siteUrl,
        maxCount: 5,
        excludeInlineAnchors: true,
        excludeInternalLinks: true,
      }),
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
    headers: buildListUnsubscribeHeaders(unsubscribeUrl),
  });

  await Promise.all(
    postsToSend.map(async (post) => {
      await markAsSent(d1, post.id, input.subscriber.emailHash, response.id);
      await deleteRetryRecord(d1, post.id, input.subscriber.emailHash);
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

  const d1 = createD1Client(context);
  const config = getNotifyConfig(context);
  const existing = await getSubscriberByEmail(d1, email);

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

  await upsertSubscriber(d1, {
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

  await recordAuditEvent(context, d1, {
    eventType: 'subscribe_requested',
    email,
    emailHash,
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
  const d1 = createD1Client(context);
  const existing = await getSubscriberByEmailHash(d1, emailHash);
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

  await upsertSubscriber(d1, record);

  await recordAuditEvent(context, d1, {
    eventType: 'subscription_confirmed',
    email,
    emailHash,
    token,
  });

  try {
    await sendWelcomeEmail(context, {
      email,
      deliveryMode,
    });
  } catch (error) {
    console.error('Welcome email send failed:', error);
  }
  await notifyAdminEvent(context, {
    event: 'subscription_confirmed',
    email,
    deliveryMode,
  });
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
  const d1 = createD1Client(context);
  const now = nowIso();
  const existing = await getSubscriberByEmailHash(d1, emailHash);

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

  await upsertSubscriber(d1, record);

  await recordAuditEvent(context, d1, {
    eventType: 'unsubscribed',
    email,
    emailHash,
    token,
  });

  try {
    await sendUnsubscribeNoticeEmail(context, email);
  } catch (error) {
    console.error('Unsubscribe notice email send failed:', error);
  }
  await notifyAdminEvent(context, {
    event: 'unsubscribed',
    email,
    deliveryMode: existing?.deliveryMode,
  });
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

  const d1 = createD1Client(context);
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

  const subscribers = await listActiveSubscribers(d1);
  const previewText = getTextPreviewWithMedia(post);
  const previewHtml = getTextPreviewHtml(post, { preserveBookmarks: true });
  const relatedLinks = getRelatedLinks(post, {
    baseUrl: getSiteUrl(context),
    maxCount: 8,
    excludeInlineAnchors: true,
    excludeInternalLinks: true,
  });
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
      const sendResult = await sendMoodEmail(context, d1, {
        post,
        previewText,
        previewHtml,
        relatedLinks,
        subscriber,
        force: Boolean(options.force),
        channelMeta,
      });

      if (sendResult.sent) {
        result.sent += 1;
        await updateSubscriberDeliveryState(d1, subscriber, post.id);
      } else {
        result.skipped += 1;
      }
    } catch (error) {
      result.failed += 1;
      const message = error instanceof Error ? error.message : 'Unknown email send error';
      await scheduleRetry(d1, {
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

  const d1 = createD1Client(context);
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

  const subscribers = await listActiveSubscribers(d1);
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
      const sendResult = await sendMoodDigestEmail(context, d1, {
        posts: digestPosts,
        subscriber,
        force: false,
        channelMeta,
      });

      if (sendResult.sent) {
        result.sent += 1;
        await updateSubscriberDeliveryState(
          d1,
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
      await scheduleRetry(d1, {
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

  const d1 = createD1Client(context);
  const retryRows = await d1.query<RetryRow>(
    `SELECT
      post_id,
      email,
      email_hash,
      attempt,
      created_at,
      updated_at,
      next_attempt_at,
      last_error
    FROM notify_retries
    ORDER BY next_attempt_at ASC
    LIMIT ?`,
    [scanLimit]
  );

  const nowMs = getNowMs();
  const dueRecords = retryRows
    .map((row): RetryRecord => ({
      postId: row.post_id,
      email: row.email,
      emailHash: row.email_hash,
      attempt: parseNullableInt(row.attempt) ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      nextAttemptAt: row.next_attempt_at,
      lastError: row.last_error,
    }))
    .filter((record) => new Date(record.nextAttemptAt).getTime() <= nowMs)
    .sort((a, b) =>
      new Date(a.nextAttemptAt).getTime() - new Date(b.nextAttemptAt).getTime()
    )
    .slice(0, processLimit);

  const output: RetryProcessResult = {
    scanned: retryRows.length,
    processed: 0,
    sent: 0,
    dropped: 0,
    failed: 0,
  };

  const postCache = new Map<string, Post | null>();
  const channelMeta = await loadChannelMeta(context);

  for (const record of dueRecords) {
    output.processed += 1;

    const activeSubscriber = await getSubscriberByEmailHash(d1, record.emailHash);

    if (!activeSubscriber || activeSubscriber.status !== 'active') {
      await deleteRetryRecord(d1, record.postId, record.emailHash);
      output.dropped += 1;
      continue;
    }

    if (await hasBeenSent(d1, record.postId, record.emailHash)) {
      await deleteRetryRecord(d1, record.postId, record.emailHash);
      output.dropped += 1;
      continue;
    }

    let post = postCache.get(record.postId);
    if (post === undefined) {
      post = await loadMoodPost(context, record.postId);
      postCache.set(record.postId, post);
    }

    if (!post) {
      await deleteRetryRecord(d1, record.postId, record.emailHash);
      output.dropped += 1;
      continue;
    }

    try {
      const previewText = getTextPreviewWithMedia(post);
      const previewHtml = getTextPreviewHtml(post, { preserveBookmarks: true });
      const relatedLinks = getRelatedLinks(post, {
        baseUrl: getSiteUrl(context),
        maxCount: 8,
        excludeInlineAnchors: true,
        excludeInternalLinks: true,
      });
      const sendResult = await sendMoodEmail(context, d1, {
        post,
        previewText,
        previewHtml,
        relatedLinks,
        subscriber: activeSubscriber,
        force: false,
        channelMeta,
      });

      if (sendResult.sent) {
        output.sent += 1;
        await updateSubscriberDeliveryState(d1, activeSubscriber, post.id);
      } else {
        output.dropped += 1;
      }

      await deleteRetryRecord(d1, record.postId, record.emailHash);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown retry send error';
      const retryOutcome = await scheduleRetry(d1, {
        postId: record.postId,
        email: record.email,
        emailHash: record.emailHash,
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

export async function readNotifyTokenFromRequest(request: Request, fallbackToken = ''): Promise<string> {
  const url = new URL(request.url);
  const queryToken = url.searchParams.get('token')?.trim() ?? '';
  if (queryToken) {
    return queryToken;
  }

  if (request.method.toUpperCase() !== 'POST') {
    return fallbackToken;
  }

  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    const formData = await request.formData().catch(() => null);
    const formToken = formData?.get('token');
    if (typeof formToken === 'string' && formToken.trim()) {
      return formToken.trim();
    }
  }

  if (contentType.includes('application/json')) {
    const payload = await request.clone().json().catch(() => null) as { token?: unknown } | null;
    if (typeof payload?.token === 'string' && payload.token.trim()) {
      return payload.token.trim();
    }
  }

  return fallbackToken;
}

export function previewUnsubscribeToken(context: NotifyRequestContext, token: string): string {
  const config = getNotifyConfig(context);
  requireConfigValue(config.tokenSecret, 'EMAIL_NOTIFY_SECRET');

  const payload = verifyNotifyToken(token, config.tokenSecret);
  if (payload.action !== 'unsubscribe') {
    throw new NotifyServiceError(400, 'invalid_token_action', 'Invalid token action');
  }

  return normalizeEmail(payload.email);
}

export function isAuthorizedSecret(request: Request, secret: string): boolean {
  if (!secret) return false;

  const authHeader = request.headers.get('authorization') ?? '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const headerSecret = request.headers.get('x-notify-secret')?.trim() ?? '';

  return secureCompareText(bearer, secret) || secureCompareText(headerSecret, secret);
}
