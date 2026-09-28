/* Demo answers for Subscribers and Broadcasts, for `astro dev` with no
   site-api behind it. Dispatched from demo-api.ts; the store lives here.

   Everything mirrors site-api's admin handlers on origin/main
   (subscribers-admin.ts, broadcasts.ts and their routes): the same query
   parameters, the same `updated_at DESC, email_hash ASC` order, the same
   global counts on every list page, the same error codes and the same
   idempotency rule for sends. One broadcast is always sending, and its
   progress advances with the clock, so the progress UI has something real
   to poll. Only imported behind `import.meta.env.DEV`. */

import {
  NOTIFY_CHANNELS,
  type AuditEntry,
  type BroadcastAudience,
  type BroadcastRecord,
  type DeliveryMode,
  type NotifyAuditEventType,
  type NotifyChannel,
  type SubscriberChannelCounts,
  type SubscriberRecord,
  type SubscriberStatus,
} from '@bunizao/contracts';

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const ACTOR = 'admin';
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{16,128}$/;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Portal-Demo': '1' },
  });
}

function fail(status: number, code: string, message = code): Response {
  return json({ error: code, message }, status);
}

function rng(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

function weighted<T>(random: () => number, entries: ReadonlyArray<readonly [T, number]>): T {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function isChannel(value: unknown): value is NotifyChannel {
  return typeof value === 'string' && (NOTIFY_CHANNELS as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

interface DemoBroadcast extends BroadcastRecord {
  /** When the demo job started sending, and how fast it goes. */
  jobStartedAt: number | null;
  perSecond: number;
  /** Every Nth recipient fails; 0 for none. */
  failEvery: number;
}

interface AudienceStore {
  subscribers: SubscriberRecord[];
  audit: AuditEntry[];
  broadcasts: DemoBroadcast[];
  nextAuditId: number;
}

const FIRST = ['lena', 'devon', 'mika', 'noah', 'priya', 'wei', 'sam', 'ines', 'jonas', 'yuki', 'omar', 'lina', 'tomasz', 'lea', 'arjun',
  'sofia', 'kenji', 'marta', 'felix', 'hana', 'diego', 'ada', 'ravi', 'chloe', 'emre', 'nora', 'lucas', 'aiko', 'mateo', 'zoe', 'xiao', 'jun'];
const LAST = ['ortiz', 'kim', 'tanaka', 'zhang', 'nguyen', 'schmidt', 'rossi', 'patel', 'chen', 'silva', 'novak', 'berg', 'li', 'wang', 'meyer', 'costa'];
const DOMAINS: ReadonlyArray<readonly [string, number]> = [
  ['gmail.com', 30], ['fastmail.com', 8], ['hey.com', 4], ['proton.me', 9], ['outlook.com', 8], ['icloud.com', 10],
  ['qq.com', 7], ['163.com', 4], ['monash.edu', 3], ['posteo.de', 3], ['mail.ru', 1], ['yahoo.co.jp', 2],
];
const CHANNEL_SETS: ReadonlyArray<readonly [NotifyChannel[], number]> = [
  [['blog', 'mood'], 40], [['mood'], 24], [['blog'], 18], [['blog', 'mood', 'announcement'], 8],
  [['blog', 'privacy'], 3], [['mood', 'announcement'], 3], [['announcement', 'blog', 'mood', 'privacy'], 4],
];
const ZONES = ['Asia/Shanghai', 'Australia/Melbourne', 'Europe/Berlin', 'America/New_York', 'Asia/Tokyo', 'UTC', 'Europe/London', 'America/Los_Angeles'];
const MOOD_POSTS = ['4821', '4817', '4809', '4796', '4788', '4770'];
const BLOG_POSTS = ['665f0a11', '661c48d2', '6708be93', '66a1f0c4'];

function channelSource(kind: string, channels: NotifyChannel[]): string {
  return `${kind}:channels:${channels.join(',')}`;
}

function sortSubscribers(rows: SubscriberRecord[]): void {
  rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.emailHash.localeCompare(b.emailHash));
}

async function seedSubscribers(store: AudienceStore): Promise<void> {
  const random = rng(20260928);
  const now = Date.now();
  const seen = new Set<string>();
  const events: Array<Omit<AuditEntry, 'id'>> = [];

  for (let index = 0; store.subscribers.length < 304; index += 1) {
    const first = FIRST[Math.floor(random() * FIRST.length)];
    const last = LAST[Math.floor(random() * LAST.length)];
    const style = random();
    const local = style < 0.4 ? `${first}.${last}` : style < 0.65 ? `${first}${Math.floor(random() * 99)}` : style < 0.85 ? `${first[0]}${last}` : `${first}_${last}${Math.floor(random() * 9)}`;
    const email = `${local}@${weighted(random, DOMAINS)}`;
    if (seen.has(email)) continue;
    seen.add(email);

    // Denser in recent months: square the roll so ages cluster near zero.
    const age = Math.round(random() ** 1.8 * 900 * DAY) + Math.round(random() * DAY);
    const createdAt = now - age;
    const status = weighted<SubscriberStatus>(random, [['active', 78], ['pending', 9], ['unsubscribed', 13]]);
    const channels = [...weighted(random, CHANNEL_SETS)];
    // Two legacy rows predate delivery modes.
    const deliveryMode = index === 17 || index === 181 ? undefined : weighted<DeliveryMode>(random, [['immediate', 62], ['every_5h', 18], ['daily', 20]]);
    const emailHash = await sha256(email);
    const requestSource = channelSource(random() < 0.85 ? 'post_request' : 'user_click', channels);

    const record: SubscriberRecord = { email, emailHash, status, channels, deliveryMode, createdAt: iso(createdAt), updatedAt: iso(createdAt) };
    if (deliveryMode === 'daily') {
      record.timezone = ZONES[Math.floor(random() * ZONES.length)];
      record.dailyHour = 6 + Math.floor(random() * 16);
    }
    record.lastConfirmSentAt = iso(createdAt);
    events.push({ eventType: 'subscribe_requested', email, emailHash, source: requestSource, createdAt: iso(createdAt) });
    let updatedAt = createdAt;

    if (status === 'pending') {
      // Some pending people asked twice.
      if (random() < 0.3) {
        const again = createdAt + Math.round(random() * 3 * DAY);
        if (again < now) {
          record.lastConfirmSentAt = iso(again);
          events.push({ eventType: 'subscribe_requested', email, emailHash, source: requestSource, createdAt: iso(again) });
          updatedAt = again;
        }
      }
    } else {
      const confirmedAt = Math.min(now - MINUTE, createdAt + Math.round((2 + random() * 180) * MINUTE));
      record.confirmedAt = iso(confirmedAt);
      events.push({ eventType: 'subscription_confirmed', email, emailHash, source: 'confirm_page', createdAt: iso(confirmedAt) });
      updatedAt = confirmedAt;
      // Unsubscribed people left somewhere between confirming and now, and
      // were last emailed before that.
      const leftAt = status === 'unsubscribed' ? confirmedAt + Math.round(random() * (now - confirmedAt - MINUTE)) : now;

      const lastMail = Math.max(confirmedAt + HOUR, leftAt - Math.round(random() ** 2 * 12 * DAY) - Math.round(random() * 6 * HOUR));
      if (lastMail < leftAt && random() < 0.9) {
        const blog = channels.includes('blog') && (!channels.includes('mood') || random() < 0.3);
        record.lastNotifiedAt = iso(lastMail);
        record.lastNotifiedPostId = blog ? `blog:${BLOG_POSTS[Math.floor(random() * BLOG_POSTS.length)]}` : MOOD_POSTS[Math.floor(random() * MOOD_POSTS.length)];
        updatedAt = Math.max(updatedAt, lastMail);
      }

      if (status === 'active' && deliveryMode && random() < 0.04) {
        // A preference change waiting for the subscriber's confirmation.
        record.pendingDeliveryMode = deliveryMode === 'daily' ? 'immediate' : 'daily';
        if (record.pendingDeliveryMode === 'daily') {
          record.pendingTimezone = ZONES[Math.floor(random() * ZONES.length)];
          record.pendingDailyHour = 8;
        }
      }

      if (status === 'unsubscribed') {
        const source = weighted(random, [['one_click_provider', 5], ['user_click', 3], ['confirm_page', 1], [`admin:${ACTOR}`, 1]] as const);
        events.push({ eventType: 'unsubscribed', email, emailHash, source, createdAt: iso(leftAt) });
        updatedAt = Math.max(updatedAt, leftAt);
      } else if (random() < 0.06) {
        const editedAt = updatedAt + Math.round(random() * (now - updatedAt - MINUTE));
        events.push({ eventType: 'admin_update', email, emailHash, source: `admin:${ACTOR}`, createdAt: iso(editedAt) });
        updatedAt = Math.max(updatedAt, editedAt);
      }
    }

    record.updatedAt = iso(updatedAt);
    store.subscribers.push(record);
  }

  sortSubscribers(store.subscribers);
  events.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  store.audit = events.map((event) => ({ ...event, id: store.nextAuditId++ }));
}

/* ------------------------------------------------------------------ */
/* Markdown and the email shell, as broadcasts.ts renders them          */
/* ------------------------------------------------------------------ */

const FONT = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function isMarkdown(value: string): boolean {
  return !/<\s*(?:html|body|table|p|div|article|section|header|h[1-6]|ul|ol|li|a|img|br|strong|em|blockquote|pre|code)\b/i.test(value);
}

function renderInline(line: string): string {
  let out = escapeHtml(line);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(?<!\*)\*(?!\*)([^*]+)\*(?!\*)/g, '<em>$1</em>');
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" style="color:#111;text-decoration:underline;">$1</a>');
  out = out.replace(/(?<!["'>=])(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#111;text-decoration:underline;">$1</a>');
  return out;
}

function renderBodyToHtml(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return '';
  // site-api sanitizes HTML bodies with cheerio; the demo strips scripts only.
  if (!isMarkdown(trimmed)) return trimmed.replace(/<script[\s\S]*?<\/script>/gi, '');
  return trimmed
    .split(/\n{2,}/g)
    .map((block) => {
      const heading = /^(#{1,3})\s+(.*)$/.exec(block.trim());
      if (heading) {
        const level = Math.min(heading[1].length + 1, 4);
        const size = level === 2 ? 22 : level === 3 ? 18 : 16;
        return `<h${level} style="margin:0 0 12px;font-family:${FONT};font-size:${size}px;font-weight:600;color:#111;">${escapeHtml(heading[2])}</h${level}>`;
      }
      const lines = block.split(/\n/g).map(renderInline).join('<br />');
      return `<p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.65;color:#111;">${lines}</p>`;
    })
    .join('\n');
}

function renderBodyToText(body: string): string {
  const trimmed = body.trim();
  if (!isMarkdown(trimmed)) return trimmed.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return trimmed.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)').replace(/[ \t]+\n/g, '\n').trim();
}

function broadcastShell(subject: string, bodyHtml: string): string {
  const footer = `<p style="margin:24px 0 0;font-size:12px;color:#888;font-family:${FONT};">You're receiving this because you subscribed at buxx.me. <a href="https://buxx.me/api/v1/notify/unsubscribe" style="color:#888;text-decoration:underline;">Unsubscribe</a>.</p>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f7f7f7;-webkit-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f7f7f7;">
  <tr><td align="center" style="padding:48px 16px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#fff;border-radius:12px;border:1px solid #ececec;">
      <tr><td style="padding:36px 36px 28px;">
        ${bodyHtml}
        ${footer}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/* Broadcasts                                                          */
/* ------------------------------------------------------------------ */

/** Who a broadcast reaches: `audienceWhereClause` in broadcasts.ts. Unlike
    the list filter, `mood` here matches only rows that list it. */
function audienceOf(store: AudienceStore, audience: BroadcastAudience): SubscriberRecord[] {
  const status = audience.status && audience.status !== 'active' ? audience.status : 'active';
  return store.subscribers.filter((row) =>
    row.status === status
    && (!audience.deliveryModes?.length || (row.deliveryMode !== undefined && audience.deliveryModes.includes(row.deliveryMode)))
    && (!audience.channels?.length || audience.channels.some((channel) => row.channels.includes(channel))));
}

/** Moves a sending broadcast along the clock, then finalizes it the way
    `finalizeBroadcastRow` does. */
function advance(record: DemoBroadcast, now = Date.now()): void {
  if (record.status !== 'sending' || record.jobStartedAt === null) return;
  const attempted = Math.min(record.recipientCount, Math.floor(((now - record.jobStartedAt) / 1000) * record.perSecond));
  const failed = record.failEvery > 0 ? Math.floor(attempted / record.failEvery) : 0;
  record.failedCount = failed;
  record.sentCount = attempted - failed;
  if (attempted >= record.recipientCount) {
    record.status = record.failedCount > 0 ? 'failed' : record.sentCount > 0 ? 'sent' : 'failed';
    record.sentAt = iso(record.jobStartedAt + (record.recipientCount / record.perSecond) * 1000);
  }
}

function publicBroadcast(record: DemoBroadcast): BroadcastRecord {
  advance(record);
  const { jobStartedAt: _start, perSecond: _rate, failEvery: _fail, ...rest } = record;
  return rest;
}

const HISTORY: ReadonlyArray<{ subject: string; body: string; channels: NotifyChannel[]; daysAgo: number; failEvery: number; share: number }> = [
  {
    subject: 'Nine months of mood posts, in one page',
    body: '# Nine months, one page\n\nI put every mood post since January on a single page, grouped by week. It reads like a diary I did not know I was keeping.\n\nhttps://buxx.me/mood\n\n**One ask:** tell me which week you would cut.',
    channels: ['mood', 'blog'], daysAgo: 0, failEvery: 0, share: 1,
  },
  {
    subject: 'A quiet note about what I shipped in August',
    body: 'Three things went out this month: comment moderation that holds instead of guessing, a faster mood page, and a portal I actually enjoy using.\n\nThe long version is on the blog: [What shipped in August](https://buxx.me/blog/august).',
    channels: ['blog'], daysAgo: 21, failEvery: 60, share: 1,
  },
  {
    subject: 'Privacy policy update: comment fingerprints',
    body: '## What changed\n\nComments now keep a short-lived device fingerprint to stop spam floods. It is deleted after 90 days and never leaves the site.\n\nThe full policy: https://buxx.me/privacy',
    channels: ['privacy'], daysAgo: 48, failEvery: 0, share: 1,
  },
  {
    subject: 'The retry budget nobody wrote down',
    body: 'New post: every client in our stack invented its own retry policy, and together they took the database down.\n\nhttps://buxx.me/blog/retry-budget',
    channels: ['blog'], daysAgo: 63, failEvery: 0, share: 0.97,
  },
  {
    subject: 'Site maintenance on Sunday',
    body: 'The site will be read-only for about twenty minutes on Sunday while the database moves. Nothing for you to do.',
    channels: ['announcement'], daysAgo: 95, failEvery: 9, share: 1,
  },
  {
    subject: 'One abstraction fewer',
    body: 'A post about deleting code: the layer that made every change twice as long, and what replaced it (nothing).\n\nhttps://buxx.me/blog/one-abstraction-fewer',
    channels: ['blog', 'mood'], daysAgo: 131, failEvery: 0, share: 0.94,
  },
  {
    subject: 'Welcome to the new newsletter',
    body: 'Hello! This list replaces the old RSS-to-email bridge. You will get new posts as they go out, or a daily digest if you prefer; change that from any email footer.',
    channels: ['blog', 'mood', 'announcement'], daysAgo: 214, failEvery: 0, share: 0.9,
  },
];

async function seedBroadcasts(store: AudienceStore): Promise<void> {
  const now = Date.now();
  let index = 0;
  for (const entry of HISTORY) {
    const audience: BroadcastAudience = { status: 'active', channels: entry.channels };
    const reach = audienceOf(store, audience).length;
    const recipientCount = Math.max(1, Math.round(reach * entry.share));
    const createdAt = entry.daysAgo === 0 ? now - 90_000 : now - entry.daysAgo * DAY - Math.round(index * 3.7 * HOUR);
    const id = `bc_${(await sha256(`${ACTOR}\0seed-${index}`)).slice(0, 32)}`;
    const running = entry.daysAgo === 0;
    const record: DemoBroadcast = {
      id,
      subject: entry.subject,
      bodyHtml: renderBodyToHtml(entry.body),
      bodyText: renderBodyToText(entry.body),
      audience,
      recipientCount,
      sentCount: 0,
      failedCount: 0,
      status: 'sending',
      createdAt: iso(createdAt),
      sentAt: null,
      sentBy: ACTOR,
      // The running one takes about eight minutes from dev-server start,
      // so there is time to watch it; finished ones started long ago.
      jobStartedAt: running ? now - 90_000 : createdAt,
      perSecond: running ? recipientCount / 570 : 20,
      failEvery: entry.failEvery,
    };
    advance(record);
    store.broadcasts.push(record);
    index += 1;
  }
  store.broadcasts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/* One store per dev-server process, seeded on the first request. A hot
   reload of this module starts over, which is what a designer wants. */
let storePromise: Promise<AudienceStore> | null = null;

/** Back to the seed, for demo-api.ts's reset: the next request re-seeds. */
export function resetAudienceDemo(): void {
  storePromise = null;
}

function getStore(): Promise<AudienceStore> {
  storePromise ??= (async () => {
    const store: AudienceStore = { subscribers: [], audit: [], broadcasts: [], nextAuditId: 40_000 };
    await seedSubscribers(store);
    await seedBroadcasts(store);
    return store;
  })();
  return storePromise;
}

function writeAudit(store: AudienceStore, eventType: NotifyAuditEventType, record: Pick<SubscriberRecord, 'email' | 'emailHash'>, source = `admin:${ACTOR}`): void {
  store.audit.push({ id: store.nextAuditId++, eventType, email: record.email, emailHash: record.emailHash, source, createdAt: new Date().toISOString() });
}

/* ------------------------------------------------------------------ */
/* Subscribers                                                         */
/* ------------------------------------------------------------------ */

function emptyChannelCounts(): SubscriberChannelCounts {
  return Object.fromEntries(
    NOTIFY_CHANNELS.map((channel) => [channel, { total: 0, pendingCount: 0, activeCount: 0, unsubscribedCount: 0 }]),
  ) as SubscriberChannelCounts;
}

function readChannelParam(value: string | null): NotifyChannel | undefined | null {
  if (!value || value === 'all') return undefined;
  return isChannel(value) ? value : null;
}

function listSubscribers(store: AudienceStore, params: URLSearchParams): Response {
  const status = params.get('status') ?? 'all';
  const channel = readChannelParam(params.get('channel'));
  const source = readChannelParam(params.get('source'));
  if (channel === null || source === null) return fail(400, 'invalid_channel');
  if (channel && source && channel !== source) return fail(400, 'channel_source_conflict');
  const wanted = channel ?? source;
  const deliveryMode = params.get('deliveryMode');
  const search = params.get('search')?.trim().toLowerCase() || '';
  const rawLimit = Number(params.get('limit') || '50');
  const rawOffset = Number(params.get('offset') || '0');
  const limit = Math.max(1, Math.min(Number.isFinite(rawLimit) ? rawLimit : 50, 200));
  const offset = Math.max(0, Number.isFinite(rawOffset) ? rawOffset : 0);

  const totals = { total: 0, pendingCount: 0, activeCount: 0, unsubscribedCount: 0 };
  const channelCounts = emptyChannelCounts();
  for (const row of store.subscribers) {
    const key = `${row.status}Count` as 'pendingCount' | 'activeCount' | 'unsubscribedCount';
    totals.total += 1;
    totals[key] += 1;
    for (const name of row.channels) {
      channelCounts[name].total += 1;
      channelCounts[name][key] += 1;
    }
  }

  const rows = params.get('countsOnly') === '1'
    ? []
    : store.subscribers
      .filter((row) =>
        (status === 'all' || row.status === status)
        && (!deliveryMode || row.deliveryMode === deliveryMode)
        && (!search || row.email.toLowerCase().includes(search))
        && (!wanted || row.channels.includes(wanted)))
      .slice(offset, offset + limit);

  return json({ rows, ...totals, channelCounts });
}

interface CreatePayload {
  email?: unknown;
  status?: unknown;
  channels?: unknown;
  channel?: unknown;
  source?: unknown;
  deliveryMode?: unknown;
  timezone?: unknown;
  dailyHour?: unknown;
}

async function createSubscriber(store: AudienceStore, request: Request): Promise<Response> {
  const payload = await request.json().catch(() => null) as CreatePayload | null;
  if (!payload) return fail(400, 'invalid_json');
  if (!payload.email) return fail(400, 'email_required');

  let channels: NotifyChannel[] | null;
  if (Array.isArray(payload.channels) && payload.channels.length) {
    const valid = payload.channels.filter(isChannel);
    channels = valid.length === payload.channels.length ? valid : null;
  } else {
    const single = typeof payload.channel === 'string' ? payload.channel : typeof payload.source === 'string' ? payload.source : undefined;
    channels = !single ? ['mood'] : isChannel(single) ? [single] : null;
  }
  if (!channels) return fail(400, 'invalid_channel');

  const email = String(payload.email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, 'invalid_email');
  const emailHash = await sha256(email);
  if (store.subscribers.some((row) => row.emailHash === emailHash)) return fail(400, 'subscriber_exists');

  const status = (typeof payload.status === 'string' ? payload.status : 'active') as SubscriberStatus;
  const deliveryMode = (typeof payload.deliveryMode === 'string' ? payload.deliveryMode : 'immediate') as DeliveryMode;
  const now = new Date().toISOString();
  const record: SubscriberRecord = {
    email,
    emailHash,
    status,
    channels,
    deliveryMode,
    timezone: deliveryMode === 'daily' ? (typeof payload.timezone === 'string' && payload.timezone ? payload.timezone : 'UTC') : undefined,
    dailyHour: deliveryMode === 'daily' ? (typeof payload.dailyHour === 'number' ? payload.dailyHour : 9) : undefined,
    createdAt: now,
    updatedAt: now,
    confirmedAt: status === 'active' ? now : undefined,
  };
  store.subscribers.unshift(record);
  sortSubscribers(store.subscribers);
  writeAudit(store, 'admin_create', record);
  return json({ subscriber: record }, 201);
}

function findSubscriber(store: AudienceStore, hash: string): SubscriberRecord | undefined {
  return store.subscribers.find((row) => row.emailHash === hash);
}

function subscriberDetail(store: AudienceStore, hash: string): Response {
  const subscriber = findSubscriber(store, hash);
  if (!subscriber) return fail(404, 'not_found');
  const audit = store.audit
    .filter((entry) => entry.emailHash === hash)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)
    .slice(0, 100);
  return json({ subscriber, audit });
}

/** `adminUpdateSubscriber`: the same defaults for daily delivery, and the
    first activation sets `confirmedAt`. */
async function updateSubscriber(store: AudienceStore, hash: string, request: Request): Promise<Response> {
  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!payload) return fail(400, 'invalid_json');
  const current = findSubscriber(store, hash);
  if (!current) return fail(404, 'subscriber_not_found');

  const status = typeof payload.status === 'string' ? payload.status as SubscriberStatus : current.status;
  const channels = Array.isArray(payload.channels) && payload.channels.length ? payload.channels as NotifyChannel[] : current.channels;
  const deliveryMode = typeof payload.deliveryMode === 'string' ? payload.deliveryMode as DeliveryMode : current.deliveryMode ?? 'immediate';
  const timezone = payload.timezone === undefined ? current.timezone : payload.timezone === null ? undefined : String(payload.timezone);
  const dailyHour = payload.dailyHour === undefined ? current.dailyHour : payload.dailyHour === null ? undefined : Number(payload.dailyHour);
  const now = new Date().toISOString();

  const next: SubscriberRecord = {
    ...current,
    status,
    channels,
    deliveryMode,
    timezone: deliveryMode === 'daily' ? (timezone || 'UTC') : undefined,
    dailyHour: deliveryMode === 'daily' ? (dailyHour ?? 9) : undefined,
    updatedAt: now,
    confirmedAt: status === 'active' && !current.confirmedAt ? now : current.confirmedAt,
  };
  Object.assign(current, next);
  if (next.timezone === undefined) delete current.timezone;
  if (next.dailyHour === undefined) delete current.dailyHour;
  sortSubscribers(store.subscribers);
  writeAudit(store, 'admin_update', current);
  if (payload.action === 'resend_confirm') writeAudit(store, 'admin_resend_confirm', current);
  return json({ subscriber: current });
}

/** DELETE is a soft delete in site-api: the row stays, unsubscribed. */
function deleteSubscriber(store: AudienceStore, hash: string): Response {
  const current = findSubscriber(store, hash);
  if (!current) return fail(404, 'subscriber_not_found');
  current.status = 'unsubscribed';
  current.updatedAt = new Date().toISOString();
  sortSubscribers(store.subscribers);
  writeAudit(store, 'admin_delete', current);
  return new Response(null, { status: 204, headers: { 'X-Portal-Demo': '1' } });
}

function sendBlogWelcome(store: AudienceStore, hash: string): Response {
  const current = findSubscriber(store, hash);
  if (!current) return fail(404, 'subscriber_not_found', 'Subscriber not found');
  if (current.status !== 'active') return fail(400, 'subscriber_not_active', 'Subscriber is not active');
  if (!current.channels.includes('blog')) return fail(400, 'subscriber_not_blog', 'Subscriber is not subscribed to blog');
  writeAudit(store, 'admin_update', current, `admin:${ACTOR}:blog_welcome`);
  return json({ status: 'sent', email: current.email, resendId: `re_demo_${Date.now().toString(36)}` });
}

/* ------------------------------------------------------------------ */
/* Broadcast routes                                                    */
/* ------------------------------------------------------------------ */

interface BroadcastPayload {
  subject?: string;
  body?: string;
  audience?: BroadcastAudience;
  dryRun?: boolean;
}

function listBroadcasts(store: AudienceStore, params: URLSearchParams): Response {
  const limit = Math.max(1, Math.min(Number(params.get('limit') || '30') || 30, 200));
  const offset = Math.max(0, Number(params.get('offset') || '0') || 0);
  return json({ broadcasts: store.broadcasts.slice(offset, offset + limit).map(publicBroadcast) });
}

async function previewBroadcast(store: AudienceStore, request: Request): Promise<Response> {
  const payload = await request.json().catch(() => null) as BroadcastPayload | null;
  if (!payload) return fail(400, 'invalid_json');
  if (!payload.subject || !payload.body || !payload.audience) return fail(400, 'fields_required');
  const subject = payload.subject.trim();
  if (!subject) return fail(400, 'subject_required');
  if (!payload.body.trim()) return fail(400, 'body_required');

  const recipients = audienceOf(store, payload.audience);
  const channelCounts: Partial<Record<NotifyChannel, number>> = {};
  for (const channel of payload.audience.channels ?? []) {
    if (isChannel(channel)) channelCounts[channel] = audienceOf(store, { ...payload.audience, channels: [channel] }).length;
  }
  return json({
    subject,
    html: broadcastShell(subject, renderBodyToHtml(payload.body)),
    text: renderBodyToText(payload.body),
    recipientCount: recipients.length,
    channelCounts,
    audienceFingerprint: await sha256(recipients.map((row) => row.emailHash).sort().join('\n')),
  });
}

async function postBroadcast(store: AudienceStore, request: Request): Promise<Response> {
  const payload = await request.json().catch(() => null) as BroadcastPayload | null;
  if (!payload) return fail(400, 'invalid_json');
  if (!payload.subject || !payload.body || !payload.audience) return fail(400, 'fields_required');
  if (payload.dryRun) return json({ recipientCount: audienceOf(store, payload.audience).length });

  const subject = payload.subject.trim();
  if (!subject) return fail(400, 'subject_required');
  const body = payload.body.trim();
  if (!body) return fail(400, 'body_required');
  const channels = (payload.audience.channels ?? []).filter(isChannel);
  if (!channels.length) return fail(400, 'audience_required');
  const key = request.headers.get('Idempotency-Key')?.trim() ?? '';
  if (!IDEMPOTENCY_KEY.test(key)) return fail(400, 'idempotency_key_required');

  const audience: BroadcastAudience = { ...payload.audience, channels };
  const recipients = audienceOf(store, audience);
  if (recipients.length === 0) return fail(400, 'audience_empty');

  const id = `bc_${(await sha256(`${ACTOR}\0${key}`)).slice(0, 32)}`;
  const bodyHtml = renderBodyToHtml(body);
  const bodyText = renderBodyToText(body);
  const normalize = (value: BroadcastAudience) => JSON.stringify({
    status: value.status,
    channels: [...value.channels].sort(),
    deliveryModes: value.deliveryModes ? [...value.deliveryModes].sort() : [],
  });
  let record = store.broadcasts.find((row) => row.id === id);
  if (record && !(record.subject === subject && record.bodyHtml === bodyHtml && record.bodyText === bodyText && normalize(record.audience) === normalize(audience))) {
    return fail(400, 'idempotency_conflict');
  }
  if (!record) {
    record = {
      id,
      subject,
      bodyHtml,
      bodyText,
      audience,
      recipientCount: recipients.length,
      sentCount: 0,
      failedCount: 0,
      status: 'sending',
      createdAt: new Date().toISOString(),
      sentAt: null,
      sentBy: ACTOR,
      jobStartedAt: Date.now(),
      // Fast enough to finish while you watch: about twenty seconds.
      perSecond: Math.max(4, recipients.length / 20),
      failEvery: 0,
    };
    store.broadcasts.unshift(record);
    for (const row of recipients) {
      row.lastNotifiedAt = record.createdAt;
      row.updatedAt = record.createdAt;
    }
    sortSubscribers(store.subscribers);
  }
  const current = publicBroadcast(record);
  return json({ id, recipientCount: current.recipientCount, sentCount: current.sentCount, failedCount: current.failedCount, status: current.status });
}

/** Answers the paths this module owns, or null to let demo-api.ts go on.
    `segments` is the decoded path below `/api/admin/`. */
export async function handleAudienceDemo(request: Request, segments: string[], params: URLSearchParams): Promise<Response | null> {
  const [resource, id, action, ...extra] = segments;
  if (resource !== 'subscribers' && resource !== 'broadcasts') return null;
  const method = request.method.toUpperCase();
  const store = await getStore();

  if (resource === 'subscribers') {
    if (!id) {
      if (method === 'GET') return listSubscribers(store, params);
      if (method === 'POST') return createSubscriber(store, request);
      return fail(405, 'method_not_allowed');
    }
    if (action === 'blog-welcome' && extra.length === 0 && method === 'POST') return sendBlogWelcome(store, id);
    if (action) return fail(404, 'not_found');
    if (method === 'GET') return subscriberDetail(store, id);
    if (method === 'PATCH') return updateSubscriber(store, id, request);
    if (method === 'DELETE') return deleteSubscriber(store, id);
    return fail(405, 'method_not_allowed');
  }

  if (!id) {
    if (method === 'GET') return listBroadcasts(store, params);
    if (method === 'POST') return postBroadcast(store, request);
    return fail(405, 'method_not_allowed');
  }
  if (id === 'preview' && !action && method === 'POST') return previewBroadcast(store, request);
  const record = store.broadcasts.find((row) => row.id === id);
  if (action === 'progress' && extra.length === 0 && method === 'GET') {
    if (!record) return fail(404, 'not_found');
    const { recipientCount, sentCount, failedCount, status } = publicBroadcast(record);
    return json({ progress: { id, recipientCount, sentCount, failedCount, status } });
  }
  if (!action && method === 'GET') return record ? json({ broadcast: publicBroadcast(record) }) : fail(404, 'not_found');
  return fail(404, 'not_found');
}
