import type {
  AdminSubscriberPatch,
  DeliveryMode,
  NotifyAuditEventType,
  NotifyChannel,
  SubscriberRecord,
  SubscriberStatus,
} from '@bunizao/contracts';
import { fullStamp } from '../comments/model';
import type { Tone } from '../moderation/ui';

/* Words and small pure rules for the subscriber screens: labels, the
   filter in the URL, what "last event" means, the optimistic mirror of
   site-api's PATCH, and the CSV. No React here. */

export type StatusFilter = SubscriberStatus | 'all';

/** Tab order, and the order of the 1-4 keys. */
export const STATUS_FILTERS: readonly StatusFilter[] = ['all', 'active', 'pending', 'unsubscribed'];

export const STATUS_LABELS: Record<StatusFilter, string> = {
  all: 'All',
  active: 'Active',
  pending: 'Pending',
  unsubscribed: 'Unsubscribed',
};

export const STATUS_TONE: Record<SubscriberStatus, Tone> = {
  active: 'neutral',
  pending: 'neutral',
  unsubscribed: 'neutral',
};

/** Display order: the two feeds most people pick first. */
export const CHANNELS: readonly NotifyChannel[] = ['blog', 'mood', 'announcement', 'privacy'];

export const CHANNEL_LABELS: Record<NotifyChannel, string> = {
  blog: 'Blog',
  mood: 'Mood',
  announcement: 'Announcements',
  privacy: 'Privacy',
};

export const CHANNEL_HINTS: Record<NotifyChannel, string> = {
  blog: 'Long-form posts',
  mood: 'Mood feed updates',
  announcement: 'Site-wide notes',
  privacy: 'Policy notices',
};

/** What a subscriber added by hand gets, the same as the site form. */
export const NEW_SUBSCRIBER_CHANNELS: NotifyChannel[] = ['blog', 'mood'];

export const DELIVERY_MODES: readonly DeliveryMode[] = ['immediate', 'every_5h', 'daily'];

export const DELIVERY_LABELS: Record<DeliveryMode, string> = {
  immediate: 'Immediate',
  every_5h: 'Every 5 hours',
  daily: 'Daily digest',
};

export const DELIVERY_SHORT: Record<DeliveryMode, string> = {
  immediate: 'Immediate',
  every_5h: 'Every 5h',
  daily: 'Daily',
};

export interface Filter {
  status: StatusFilter;
  channel: NotifyChannel | null;
  delivery: DeliveryMode | null;
}

export const ALL: Filter = { status: 'all', channel: null, delivery: null };

export function readFilter(search: URLSearchParams): Filter {
  const status = search.get('status');
  const channel = search.get('channel');
  const delivery = search.get('delivery');
  return {
    status: (STATUS_FILTERS as readonly string[]).includes(status ?? '') ? (status as StatusFilter) : 'all',
    channel: (CHANNELS as readonly string[]).includes(channel ?? '') ? (channel as NotifyChannel) : null,
    delivery: (DELIVERY_MODES as readonly string[]).includes(delivery ?? '') ? (delivery as DeliveryMode) : null,
  };
}

export function filterKey(filter: Filter): string {
  return `${filter.status}|${filter.channel ?? ''}|${filter.delivery ?? ''}`;
}

export function isAll(filter: Filter): boolean {
  return filter.status === 'all' && !filter.channel && !filter.delivery;
}

/** The server's filter, row by row. Channels are never empty here: site-api
    reads a missing list as `mood`, which is also what its mood filter
    matches. */
export function matchesFilter(row: SubscriberRecord, filter: Filter): boolean {
  return (filter.status === 'all' || row.status === filter.status)
    && (!filter.channel || row.channels.includes(filter.channel))
    && (!filter.delivery || row.deliveryMode === filter.delivery);
}

export interface FacetCounts {
  status: Record<StatusFilter, number>;
  channel: Record<NotifyChannel | 'all', number>;
  delivery: Record<DeliveryMode | 'all', number>;
}

/** Each control counts what picking one of its options would show, given
    the other two: the status counts respect the channel and delivery
    filters, and so on. One pass over the rows. */
export function countFacets(rows: readonly SubscriberRecord[], filter: Filter): FacetCounts {
  const counts: FacetCounts = {
    status: { all: 0, active: 0, pending: 0, unsubscribed: 0 },
    channel: { all: 0, blog: 0, mood: 0, announcement: 0, privacy: 0 },
    delivery: { all: 0, immediate: 0, every_5h: 0, daily: 0 },
  };
  for (const row of rows) {
    const status = filter.status === 'all' || row.status === filter.status;
    const channel = !filter.channel || row.channels.includes(filter.channel);
    const delivery = !filter.delivery || row.deliveryMode === filter.delivery;
    if (channel && delivery) {
      counts.status.all += 1;
      counts.status[row.status] += 1;
    }
    if (status && delivery) {
      counts.channel.all += 1;
      for (const name of row.channels) counts.channel[name] += 1;
    }
    if (status && channel) {
      counts.delivery.all += 1;
      if (row.deliveryMode) counts.delivery[row.deliveryMode] += 1;
    }
  }
  return counts;
}

/** The server's search is one substring of the address; so is this one. */
export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function matchesQuery(row: SubscriberRecord, query: string): boolean {
  return !query || row.email.includes(query);
}

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Every channel reads as two words; a table cell has no room for four names. */
export function channelsText(channels: readonly NotifyChannel[]): string {
  if (CHANNELS.every((channel) => channels.includes(channel))) return 'All channels';
  return CHANNELS.filter((channel) => channels.includes(channel)).map((channel) => CHANNEL_LABELS[channel]).join(', ');
}

export function hourText(hour: number | undefined): string {
  return `${String(hour ?? 9).padStart(2, '0')}:00`;
}

export function deliveryText(row: Pick<SubscriberRecord, 'deliveryMode' | 'dailyHour' | 'timezone'>): string {
  if (!row.deliveryMode) return 'Not set';
  if (row.deliveryMode === 'daily') return `Daily ${hourText(row.dailyHour)}`;
  return DELIVERY_SHORT[row.deliveryMode];
}

export function pendingDeliveryText(row: SubscriberRecord): string | null {
  if (!row.pendingDeliveryMode) return null;
  const mode = row.pendingDeliveryMode === 'daily'
    ? `Daily at ${hourText(row.pendingDailyHour)} ${row.pendingTimezone ?? 'UTC'}`
    : DELIVERY_LABELS[row.pendingDeliveryMode];
  return `${mode}, waiting for the subscriber to confirm`;
}

/** `2026-03-14`, local time. */
export function dateOnly(iso: string): string {
  return fullStamp(iso).slice(0, 10);
}

export interface LastEvent {
  label: string;
  at: string;
}

/** The newest thing that happened to a subscriber. site-api writes
    `updatedAt` on every change, emails included, so it is the newest time;
    the more specific field that shares that moment names it. A later
    `updatedAt` with no field to explain it is an edit, or for an
    unsubscribed row, most likely the unsubscribe. */
export function lastEvent(row: SubscriberRecord): LastEvent {
  // In priority order, for events that land within the same minute.
  const candidates: LastEvent[] = [];
  if (row.lastNotifiedAt) candidates.push({ label: 'Emailed', at: row.lastNotifiedAt });
  if (row.confirmedAt) candidates.push({ label: 'Confirmed', at: row.confirmedAt });
  candidates.push({ label: 'Joined', at: row.createdAt });
  if (row.lastConfirmSentAt) candidates.push({ label: 'Asked to confirm', at: row.lastConfirmSentAt });

  const newest = Math.max(...candidates.map((entry) => Date.parse(entry.at)));
  const updated = Date.parse(row.updatedAt);
  if (updated - newest > 60_000) {
    return { label: row.status === 'unsubscribed' ? 'Unsubscribed' : 'Updated', at: row.updatedAt };
  }
  return candidates.find((entry) => newest - Date.parse(entry.at) <= 60_000) ?? candidates[0];
}

export const AUDIT_LABELS: Record<NotifyAuditEventType, string> = {
  subscribe_requested: 'Asked to subscribe',
  subscription_confirmed: 'Confirmed',
  unsubscribed: 'Unsubscribed',
  email_change_requested: 'Asked to change address',
  email_changed: 'Changed address',
  admin_create: 'Added in the portal',
  admin_update: 'Edited in the portal',
  admin_delete: 'Deleted in the portal',
  admin_resend_confirm: 'Confirmation resend logged',
  broadcast_sent: 'Broadcast sent',
};

const REQUEST_SOURCES: Record<string, string> = {
  post_request: 'site form',
  user_click: 'button in an email or page',
  confirm_page: 'email link',
  one_click_provider: 'mail app one-click unsubscribe',
  prefetch: 'link prefetch',
  link_scanner: 'mail link scanner',
  bot: 'bot',
  unknown: 'unknown source',
};

/** `post_request:channels:blog,mood` → `site form · Blog, Mood`;
    `admin:bunizao:blog_welcome` → `bunizao · blog welcome`. */
export function auditSource(source: string): string {
  if (source.startsWith('admin:')) {
    const [, actor, detail] = source.split(':');
    return [actor, detail?.replace(/_/g, ' ')].filter(Boolean).join(' · ');
  }
  const [kind, marker, list] = source.split(':');
  const words = REQUEST_SOURCES[kind] ?? kind.replace(/_/g, ' ');
  if (marker === 'channels' && list) {
    return `${words} · ${channelsText(list.split(',').filter((name): name is NotifyChannel => name in CHANNEL_LABELS))}`;
  }
  return words;
}

export function auditLabel(eventType: NotifyAuditEventType, source: string): string {
  if (eventType === 'admin_update' && source.endsWith(':blog_welcome')) return 'Blog welcome sent';
  return AUDIT_LABELS[eventType] ?? eventType.replace(/_/g, ' ');
}

export type SubscriberPatch = AdminSubscriberPatch & { action?: 'resend_confirm' };

/** What site-api's `adminUpdateSubscriber` will store, so the screen can
    show it before the answer arrives. Daily delivery defaults to 09:00 UTC,
    leaving daily clears both, and the first activation sets `confirmedAt`. */
export function applyPatch(row: SubscriberRecord, patch: SubscriberPatch, now = new Date().toISOString()): SubscriberRecord {
  const status = patch.status ?? row.status;
  const deliveryMode = patch.deliveryMode ?? row.deliveryMode ?? 'immediate';
  const timezone = patch.timezone === undefined ? row.timezone : patch.timezone ?? undefined;
  const dailyHour = patch.dailyHour === undefined ? row.dailyHour : patch.dailyHour ?? undefined;
  return {
    ...row,
    status,
    channels: patch.channels?.length ? patch.channels : row.channels,
    deliveryMode,
    timezone: deliveryMode === 'daily' ? timezone || 'UTC' : undefined,
    dailyHour: deliveryMode === 'daily' ? dailyHour ?? 9 : undefined,
    updatedAt: now,
    confirmedAt: status === 'active' && !row.confirmedAt ? now : row.confirmedAt,
  };
}

/** The fields to send to put a row back the way it was. */
export function restorePatch(before: SubscriberRecord): SubscriberPatch {
  return {
    status: before.status,
    channels: before.channels,
    deliveryMode: before.deliveryMode ?? 'immediate',
    timezone: before.deliveryMode === 'daily' ? before.timezone ?? null : null,
    dailyHour: before.deliveryMode === 'daily' ? before.dailyHour ?? null : null,
  };
}

/* CSV. A cell that starts with = + - @ is prefixed with a quote, so a
   spreadsheet never runs an address as a formula. */

const CSV_COLUMNS: Array<[string, (row: SubscriberRecord) => string | number | undefined]> = [
  ['email', (row) => row.email],
  ['status', (row) => row.status],
  ['channels', (row) => row.channels.join(';')],
  ['delivery_mode', (row) => row.deliveryMode],
  ['timezone', (row) => row.timezone],
  ['daily_hour', (row) => row.dailyHour],
  ['joined_at', (row) => row.createdAt],
  ['confirmed_at', (row) => row.confirmedAt],
  ['last_emailed_at', (row) => row.lastNotifiedAt],
  ['last_emailed_post', (row) => row.lastNotifiedPostId],
  ['updated_at', (row) => row.updatedAt],
  ['email_hash', (row) => row.emailHash],
];

function csvCell(value: string | number | undefined): string {
  if (value === undefined || value === null) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: readonly SubscriberRecord[]): string {
  const lines = [CSV_COLUMNS.map(([name]) => name).join(',')];
  for (const row of rows) lines.push(CSV_COLUMNS.map(([, read]) => csvCell(read(row))).join(','));
  return `${lines.join('\r\n')}\r\n`;
}

export function csvFilename(filter: Filter, query: string): string {
  const parts = ['subscribers', filter.status, filter.channel, filter.delivery, query ? 'search' : null]
    .filter((part): part is string => Boolean(part) && part !== 'all');
  return `${parts.join('-')}-${dateOnly(new Date().toISOString())}.csv`;
}

export async function emailHash(email: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.trim().toLowerCase()));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
