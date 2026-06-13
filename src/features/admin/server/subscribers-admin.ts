import { createNotifyD1Client, type NotifyD1Client } from '@/features/notify/server/d1';
import { hashEmail, isValidEmail, normalizeEmail } from '@/features/notify/server/security';
import {
  NOTIFY_CHANNELS,
  type DeliveryMode,
  type NotifyAuditEventType,
  type NotifyChannel,
  type SubscriberRecord,
  type SubscriberStatus,
} from '@/features/notify/server/types';
import type {
  AdminSubscriberInput,
  AdminSubscriberPatch,
  AuditEntry,
  SubscriberFilter,
  SubscriberListResult,
} from '@bunizao/contracts/admin';

export type {
  AdminSubscriberInput,
  AdminSubscriberPatch,
  AuditEntry,
  SubscriberFilter,
  SubscriberListResult,
} from '@bunizao/contracts/admin';

export interface AdminContext {
  request: Request;
  locals?: any;
  actor: string;
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
  channels,
  created_at,
  updated_at,
  confirmed_at,
  last_confirm_sent_at
`;

interface SubscriberRow {
  email: string;
  email_hash: string;
  status: SubscriberStatus;
  delivery_mode: DeliveryMode | null;
  timezone: string | null;
  daily_hour: number | null;
  pending_delivery_mode: DeliveryMode | null;
  pending_timezone: string | null;
  pending_daily_hour: number | null;
  last_notified_at: string | null;
  last_notified_post_id: string | null;
  channels: string | null;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
  last_confirm_sent_at: string | null;
}

interface AuditRow {
  id: number;
  event_type: NotifyAuditEventType;
  email: string;
  email_hash: string;
  source: string;
  user_agent: string | null;
  created_at: string;
}

function parseChannels(value: string | null | undefined): NotifyChannel[] {
  if (!value) return ['mood'];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return ['mood'];
    const valid = parsed.filter(
      (entry): entry is NotifyChannel =>
        typeof entry === 'string' && (NOTIFY_CHANNELS as readonly string[]).includes(entry)
    );
    return valid.length ? Array.from(new Set(valid)) : ['mood'];
  } catch {
    return ['mood'];
  }
}

function serializeChannels(channels: NotifyChannel[]): string {
  const valid = channels.filter((channel) => (NOTIFY_CHANNELS as readonly string[]).includes(channel));
  const unique = Array.from(new Set(valid.length ? valid : ['mood']));
  return JSON.stringify(unique);
}

function mapRow(row: SubscriberRow): SubscriberRecord {
  return {
    email: row.email,
    emailHash: row.email_hash,
    status: row.status,
    channels: parseChannels(row.channels),
    deliveryMode: row.delivery_mode ?? undefined,
    timezone: row.timezone ?? undefined,
    dailyHour: typeof row.daily_hour === 'number' ? row.daily_hour : undefined,
    pendingDeliveryMode: row.pending_delivery_mode ?? undefined,
    pendingTimezone: row.pending_timezone ?? undefined,
    pendingDailyHour: typeof row.pending_daily_hour === 'number' ? row.pending_daily_hour : undefined,
    lastNotifiedAt: row.last_notified_at ?? undefined,
    lastNotifiedPostId: row.last_notified_post_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    confirmedAt: row.confirmed_at ?? undefined,
    lastConfirmSentAt: row.last_confirm_sent_at ?? undefined,
  };
}

function nullable<T>(value: T | undefined | null): T | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && !value.trim()) return null;
  return value;
}

export function createAdminD1(context: AdminContext): NotifyD1Client {
  return createNotifyD1Client({ locals: context.locals });
}

export async function listSubscribers(
  context: AdminContext,
  filter: SubscriberFilter = {}
): Promise<SubscriberListResult> {
  const d1 = createAdminD1(context);
  const limit = Math.max(1, Math.min(filter.limit ?? 50, 200));
  const offset = Math.max(0, filter.offset ?? 0);

  const where: string[] = [];
  const params: unknown[] = [];

  if (filter.status && filter.status !== 'all') {
    where.push('status = ?');
    params.push(filter.status);
  }
  if (filter.deliveryMode) {
    where.push('delivery_mode = ?');
    params.push(filter.deliveryMode);
  }
  if (filter.search) {
    where.push('LOWER(email) LIKE ?');
    params.push(`%${filter.search.trim().toLowerCase()}%`);
  }
  if (filter.channel) {
    where.push('channels LIKE ?');
    params.push(`%"${filter.channel}"%`);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = await d1.query<SubscriberRow>(
    `SELECT ${SUBSCRIBER_COLUMNS}
     FROM notify_subscribers
     ${whereClause}
     ORDER BY datetime(updated_at) DESC, email_hash ASC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const totals = await d1.first<{
    total: number;
    pending: number;
    active: number;
    unsubscribed: number;
  }>(
    `SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN status = 'unsubscribed' THEN 1 ELSE 0 END) as unsubscribed
     FROM notify_subscribers`
  );

  return {
    rows: rows.map(mapRow),
    total: Number(totals?.total ?? 0),
    pendingCount: Number(totals?.pending ?? 0),
    activeCount: Number(totals?.active ?? 0),
    unsubscribedCount: Number(totals?.unsubscribed ?? 0),
  };
}

export async function getSubscriberByHash(
  context: AdminContext,
  emailHash: string
): Promise<SubscriberRecord | null> {
  const d1 = createAdminD1(context);
  const row = await d1.first<SubscriberRow>(
    `SELECT ${SUBSCRIBER_COLUMNS} FROM notify_subscribers WHERE email_hash = ? LIMIT 1`,
    [emailHash]
  );
  return row ? mapRow(row) : null;
}

export async function getSubscriberAuditTrail(
  context: AdminContext,
  emailHash: string,
  limit = 50
): Promise<AuditEntry[]> {
  const d1 = createAdminD1(context);
  const rows = await d1.query<AuditRow>(
    `SELECT id, event_type, email, email_hash, source, user_agent, created_at
     FROM notify_audit
     WHERE email_hash = ?
     ORDER BY datetime(created_at) DESC
     LIMIT ?`,
    [emailHash, Math.min(Math.max(1, limit), 200)]
  );
  return rows.map((row) => ({
    id: Number(row.id),
    eventType: row.event_type,
    email: row.email,
    emailHash: row.email_hash,
    source: row.source,
    userAgent: row.user_agent ?? undefined,
    createdAt: row.created_at,
  }));
}

export async function listRecentAuditEvents(
  context: AdminContext,
  limit = 20
): Promise<AuditEntry[]> {
  const d1 = createAdminD1(context);
  const rows = await d1.query<AuditRow>(
    `SELECT id, event_type, email, email_hash, source, user_agent, created_at
     FROM notify_audit
     ORDER BY datetime(created_at) DESC
     LIMIT ?`,
    [Math.min(Math.max(1, limit), 100)]
  );
  return rows.map((row) => ({
    id: Number(row.id),
    eventType: row.event_type,
    email: row.email,
    emailHash: row.email_hash,
    source: row.source,
    userAgent: row.user_agent ?? undefined,
    createdAt: row.created_at,
  }));
}

async function writeAuditEvent(
  d1: NotifyD1Client,
  input: {
    eventType: NotifyAuditEventType;
    email: string;
    emailHash: string;
    source: string;
  }
): Promise<void> {
  try {
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
        input.eventType,
        input.emailHash,
        input.email,
        input.source,
        null,
        null,
        null,
        new Date().toISOString(),
      ]
    );
  } catch (error) {
    console.error('Admin audit write failed:', error);
  }
}

async function persistSubscriber(d1: NotifyD1Client, record: SubscriberRecord): Promise<void> {
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
      channels,
      created_at,
      updated_at,
      confirmed_at,
      last_confirm_sent_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      channels = excluded.channels,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      confirmed_at = excluded.confirmed_at,
      last_confirm_sent_at = excluded.last_confirm_sent_at`,
    [
      record.email,
      record.emailHash,
      record.status,
      nullable(record.deliveryMode),
      nullable(record.timezone),
      typeof record.dailyHour === 'number' ? record.dailyHour : null,
      nullable(record.pendingDeliveryMode),
      nullable(record.pendingTimezone),
      typeof record.pendingDailyHour === 'number' ? record.pendingDailyHour : null,
      nullable(record.lastNotifiedAt),
      nullable(record.lastNotifiedPostId),
      serializeChannels(record.channels ?? ['mood']),
      record.createdAt,
      record.updatedAt,
      nullable(record.confirmedAt),
      nullable(record.lastConfirmSentAt),
    ]
  );
}

export async function adminCreateSubscriber(
  context: AdminContext,
  input: AdminSubscriberInput
): Promise<SubscriberRecord> {
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) {
    throw new Error('invalid_email');
  }

  const emailHash = hashEmail(email);
  const d1 = createAdminD1(context);
  const existing = await d1.first<SubscriberRow>(
    `SELECT ${SUBSCRIBER_COLUMNS} FROM notify_subscribers WHERE email_hash = ? LIMIT 1`,
    [emailHash]
  );
  if (existing) {
    throw new Error('subscriber_exists');
  }

  const now = new Date().toISOString();
  const record: SubscriberRecord = {
    email,
    emailHash,
    status: input.status,
    channels: input.channels.length ? input.channels : ['mood'],
    deliveryMode: input.deliveryMode,
    timezone: input.deliveryMode === 'daily' ? (input.timezone || 'UTC') : undefined,
    dailyHour: input.deliveryMode === 'daily' ? (input.dailyHour ?? 9) : undefined,
    createdAt: now,
    updatedAt: now,
    confirmedAt: input.status === 'active' ? now : undefined,
  };

  await persistSubscriber(d1, record);
  await writeAuditEvent(d1, {
    eventType: 'admin_create',
    email,
    emailHash,
    source: `admin:${context.actor}`,
  });

  return record;
}

export async function adminUpdateSubscriber(
  context: AdminContext,
  emailHash: string,
  patch: AdminSubscriberPatch
): Promise<SubscriberRecord> {
  const d1 = createAdminD1(context);
  const existing = await d1.first<SubscriberRow>(
    `SELECT ${SUBSCRIBER_COLUMNS} FROM notify_subscribers WHERE email_hash = ? LIMIT 1`,
    [emailHash]
  );
  if (!existing) {
    throw new Error('subscriber_not_found');
  }

  const current = mapRow(existing);
  const now = new Date().toISOString();
  const nextStatus = patch.status ?? current.status;
  const nextDelivery = patch.deliveryMode ?? current.deliveryMode ?? 'immediate';
  const nextTimezone =
    patch.timezone === undefined ? current.timezone : patch.timezone === null ? undefined : patch.timezone;
  const nextDailyHour =
    patch.dailyHour === undefined
      ? current.dailyHour
      : patch.dailyHour === null
      ? undefined
      : patch.dailyHour;

  const next: SubscriberRecord = {
    ...current,
    status: nextStatus,
    channels: patch.channels?.length ? patch.channels : current.channels,
    deliveryMode: nextDelivery,
    timezone: nextDelivery === 'daily' ? (nextTimezone || 'UTC') : undefined,
    dailyHour: nextDelivery === 'daily' ? (nextDailyHour ?? 9) : undefined,
    updatedAt: now,
    confirmedAt:
      nextStatus === 'active' && !current.confirmedAt ? now : current.confirmedAt,
  };

  await persistSubscriber(d1, next);
  await writeAuditEvent(d1, {
    eventType: 'admin_update',
    email: next.email,
    emailHash: next.emailHash,
    source: `admin:${context.actor}`,
  });

  return next;
}

export async function adminDeleteSubscriber(
  context: AdminContext,
  emailHash: string
): Promise<void> {
  const d1 = createAdminD1(context);
  const existing = await d1.first<SubscriberRow>(
    `SELECT ${SUBSCRIBER_COLUMNS} FROM notify_subscribers WHERE email_hash = ? LIMIT 1`,
    [emailHash]
  );
  if (!existing) {
    throw new Error('subscriber_not_found');
  }

  const current = mapRow(existing);
  const now = new Date().toISOString();
  await persistSubscriber(d1, {
    ...current,
    status: 'unsubscribed',
    updatedAt: now,
  });

  await writeAuditEvent(d1, {
    eventType: 'admin_delete',
    email: current.email,
    emailHash: current.emailHash,
    source: `admin:${context.actor}`,
  });
}

export async function adminAuditResendConfirm(
  context: AdminContext,
  email: string
): Promise<void> {
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) {
    throw new Error('invalid_email');
  }
  const d1 = createAdminD1(context);
  await writeAuditEvent(d1, {
    eventType: 'admin_resend_confirm',
    email: normalized,
    emailHash: hashEmail(normalized),
    source: `admin:${context.actor}`,
  });
}
