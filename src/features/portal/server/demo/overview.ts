/* Demo answers for Home, Activity and Analytics, for `astro dev` with no
   site-api behind it. Dispatched from demo-api.ts, which owns the store.

   The analytics half generates a raw event log and aggregates it the way
   site-api's blog-analytics.ts does -- same `LIMIT 10000`, same sparse
   `daily`, same sort orders -- so the screens meet the real edge cases
   (a truncated 90-day range, a day with no rows) instead of a fixture's
   tidy ones. Only imported behind `import.meta.env.DEV`. */

import {
  BLOG_ANALYTICS_READ_THRESHOLD_MS,
  NOTIFY_GATE_DECISIONS,
  type AdminCommentRecord,
  type AuditEntry,
  type BlogAnalyticsArticleDetailResult,
  type BlogAnalyticsBreakdown,
  type BlogAnalyticsEventRecord,
  type BlogAnalyticsSummaryResult,
  type BlogAnalyticsTotals,
  type NotifyAuditEventType,
  type NotifyGateDecision,
  type NotifyGateStatus,
} from '@bunizao/contracts';
import { DEMO_ANALYTICS } from '@/features/admin/server/portal-analytics-demo';
import {
  ACTIVITY_EVENTS,
  type PortalActivityEntry,
  type PortalActivityEvent,
  type PortalActivitySummary,
} from '@/features/admin/server/portal-client';

interface OverviewStore {
  comments: AdminCommentRecord[];
  activity: PortalActivityEntry[];
}

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Portal-Demo': '1' },
  });
}

function fail(status: number, code: string): Response {
  return json({ error: code, message: code }, status);
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(raw);
  if (raw === null || raw === '' || !Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
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

/* ------------------------------------------------------------------ */
/* Analytics                                                           */
/* ------------------------------------------------------------------ */

/* The published posts of the demo Ghost list (demo/tools.ts), so the portal
   can name them by title, plus one old post that list does not have, which
   shows as its slug. Each has a publish age in days, so each launch leaves a
   decaying spike in the traffic. */
const ARTICLES: ReadonlyArray<{ slug: string; weight: number; publishedDaysAgo: number }> = [
  { slug: 'quiet-architecture', weight: 9, publishedDaysAgo: 4 },
  { slug: 'shell-work-before-polish', weight: 7, publishedDaysAgo: 9 },
  { slug: 'notes-from-the-links-lab', weight: 6, publishedDaysAgo: 16 },
  { slug: 'on-quiet-architecture', weight: 5, publishedDaysAgo: 31 },
  { slug: 'demo-effects', weight: 4, publishedDaysAgo: 58 },
  { slug: 'cloudflare-queues-without-the-queue-and-other-lessons-from-a-weekend-of-rewrites', weight: 2, publishedDaysAgo: 180 },
];

const COUNTRIES: ReadonlyArray<readonly [{ code: string | null; city: string | null; asOrg: string | null; asn: number | null }, number]> = [
  [{ code: 'CN', city: 'Shanghai', asOrg: 'China Telecom', asn: 4812 }, 26],
  [{ code: 'US', city: 'San Francisco', asOrg: 'Comcast', asn: 7922 }, 14],
  [{ code: 'TW', city: 'Taipei', asOrg: 'Chunghwa Telecom', asn: 3462 }, 8],
  [{ code: 'AU', city: 'Melbourne', asOrg: 'Telstra', asn: 1221 }, 7],
  [{ code: 'HK', city: 'Hong Kong', asOrg: 'HKT', asn: 4760 }, 6],
  [{ code: 'JP', city: 'Tokyo', asOrg: 'KDDI', asn: 2516 }, 6],
  [{ code: 'SG', city: 'Singapore', asOrg: 'Singtel', asn: 7473 }, 5],
  [{ code: 'DE', city: 'Berlin', asOrg: 'Deutsche Telekom', asn: 3320 }, 5],
  [{ code: 'GB', city: 'London', asOrg: 'BT', asn: 2856 }, 4],
  [{ code: 'CA', city: 'Toronto', asOrg: 'Rogers', asn: 812 }, 3],
  [{ code: 'KR', city: 'Seoul', asOrg: 'KT', asn: 4766 }, 3],
  [{ code: 'FR', city: 'Paris', asOrg: 'Orange', asn: 3215 }, 3],
  [{ code: 'IN', city: 'Bengaluru', asOrg: 'Bharti Airtel', asn: 24560 }, 3],
  [{ code: 'NL', city: 'Amsterdam', asOrg: 'KPN', asn: 1136 }, 2],
  [{ code: 'BR', city: 'São Paulo', asOrg: 'Vivo', asn: 26599 }, 1],
  [{ code: null, city: null, asOrg: null, asn: null }, 2],
];

const CLIENTS: ReadonlyArray<readonly [{ platform: string; browser: string; os: string; device: string; ua: string }, number]> = [
  [{ platform: 'chrome', browser: 'Chrome', os: 'macOS', device: 'desktop', ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/140.0' }, 20],
  [{ platform: 'chrome', browser: 'Chrome', os: 'Windows', device: 'desktop', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0' }, 12],
  [{ platform: 'chrome', browser: 'Chrome', os: 'Android', device: 'mobile', ua: 'Mozilla/5.0 (Linux; Android 15) Chrome/140.0 Mobile' }, 8],
  [{ platform: 'safari', browser: 'Safari', os: 'iOS', device: 'mobile', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) Safari/605.1' }, 18],
  [{ platform: 'safari', browser: 'Safari', os: 'macOS', device: 'desktop', ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1' }, 6],
  [{ platform: 'safari', browser: 'Safari', os: 'iPadOS', device: 'tablet', ua: 'Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X) Safari/605.1' }, 3],
  [{ platform: 'wechat', browser: 'WeChat', os: 'iOS', device: 'mobile', ua: 'Mozilla/5.0 (iPhone) MicroMessenger/8.0.50' }, 11],
  [{ platform: 'edge', browser: 'Edge', os: 'Windows', device: 'desktop', ua: 'Mozilla/5.0 (Windows NT 10.0) Edg/140.0' }, 6],
  [{ platform: 'firefox', browser: 'Firefox', os: 'Linux', device: 'desktop', ua: 'Mozilla/5.0 (X11; Linux x86_64; rv:142.0) Firefox/142.0' }, 5],
  [{ platform: 'weibo', browser: 'Weibo', os: 'Android', device: 'mobile', ua: 'Mozilla/5.0 (Linux; Android 15) Weibo' }, 2],
  [{ platform: 'qq', browser: 'QQ', os: 'Android', device: 'mobile', ua: 'Mozilla/5.0 (Linux; Android 15) QQ/9.0' }, 2],
  [{ platform: 'other', browser: 'Other', os: 'Other', device: 'other', ua: 'curl/8.7.1' }, 2],
];

const REFERRERS: ReadonlyArray<readonly [{ source: string; referrer: string | null }, number]> = [
  [{ source: 'direct', referrer: null }, 34],
  [{ source: 'search', referrer: 'https://www.google.com/' }, 18],
  [{ source: 'search', referrer: 'https://www.bing.com/' }, 4],
  [{ source: 'telegram', referrer: 'https://t.me/' }, 15],
  [{ source: 'twitter', referrer: 'https://t.co/' }, 9],
  [{ source: 'internal', referrer: 'https://buxx.me/blog' }, 9],
  [{ source: 'external', referrer: 'https://news.ycombinator.com/' }, 5],
  [{ source: 'external', referrer: 'https://www.v2ex.com/' }, 4],
];

const HISTORY_DAYS = 120;
let events: BlogAnalyticsEventRecord[] | null = null;

/** The raw log, newest first, generated once per process. */
function analyticsEvents(): BlogAnalyticsEventRecord[] {
  if (events) return events;
  const random = rng(20260928);
  const now = Date.now();
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);
  const hex = (n: number) => Math.floor(random() * 16 ** n).toString(16).padStart(n, '0');
  const returning = Array.from({ length: 900 }, () => `v_${hex(10)}`);
  const rows: BlogAnalyticsEventRecord[] = [];

  for (let age = HISTORY_DAYS - 1; age >= 0; age -= 1) {
    const dayStart = startOfToday.getTime() - age * DAY;
    const weekday = new Date(dayStart).getUTCDay();
    const launches = ARTICLES.map((article) => {
      const since = article.publishedDaysAgo - age;
      return since >= 0 ? 320 * Math.exp(-since / 1.6) : 0;
    });
    const base = 118 * (weekday === 0 || weekday === 6 ? 0.72 : 1) * (0.85 + random() * 0.3);
    const count = Math.round(base + launches.reduce((sum, value) => sum + value, 0));
    const dayEnd = age === 0 ? now : dayStart + DAY;

    for (let index = 0; index < count; index += 1) {
      const openedMs = dayStart + random() * (dayEnd - dayStart);
      if (openedMs > now) continue;
      const slug = weighted(random, ARTICLES.flatMap((article, i) =>
        article.publishedDaysAgo >= age ? [[article.slug, article.weight + launches[i] / 12] as const] : []));
      const bounce = random() < 0.36;
      const dwellMs = bounce
        ? Math.round(400 + random() * (BLOG_ANALYTICS_READ_THRESHOLD_MS - 500))
        : Math.round(BLOG_ANALYTICS_READ_THRESHOLD_MS + Math.exp(random() * 4.2) * 3_000);
      const scrollDepth = bounce ? Math.round(random() * 40) / 100 : Math.min(1, Math.round((0.3 + random() * 0.8) * 100) / 100);
      const place = weighted(random, COUNTRIES);
      const client = weighted(random, CLIENTS);
      const ref = weighted(random, REFERRERS);
      const openedAt = new Date(openedMs).toISOString();
      const updatedAt = new Date(Math.min(now, openedMs + dwellMs)).toISOString();

      rows.push({
        eventId: `ev_${hex(12)}`,
        slug,
        visitorId: random() < 0.42 ? returning[Math.floor(random() * returning.length)] : `v_${hex(10)}`,
        sessionId: `s_${hex(8)}`,
        openedAt,
        dwellMs,
        scrollDepth,
        completed: scrollDepth >= 0.9,
        ip: place.code ? `203.0.113.${Math.floor(random() * 254) + 1}` : null,
        country: place.code,
        region: null,
        city: place.city,
        asn: place.asn,
        asOrg: place.asOrg,
        colo: place.code === 'US' ? 'SJC' : place.code === 'AU' ? 'MEL' : place.code ? 'SIN' : null,
        ua: client.ua,
        browser: client.browser,
        os: client.os,
        deviceType: client.device,
        platform: client.platform,
        lang: place.code === 'CN' || place.code === 'TW' || place.code === 'HK' ? 'zh-CN' : 'en-US',
        referrer: ref.referrer,
        refSource: ref.source,
        createdAt: openedAt,
        updatedAt,
      });
    }
  }

  events = rows.sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  return events;
}

/* The next four mirror site-api's blog-analytics.ts line for line. */

function totals(rows: BlogAnalyticsEventRecord[]): BlogAnalyticsTotals {
  const reads = rows.filter((row) => row.dwellMs >= BLOG_ANALYTICS_READ_THRESHOLD_MS);
  const uniqueVisitors = new Set(rows.map((row) => row.visitorId)).size;
  const readDwell = reads.reduce((sum, row) => sum + row.dwellMs, 0);
  const allDwell = rows.reduce((sum, row) => sum + row.dwellMs, 0);
  return {
    views: rows.length,
    reads: reads.length,
    uniqueVisitors,
    avgReadMs: reads.length ? Math.round(readDwell / reads.length) : 0,
    avgVisitorReadMs: uniqueVisitors ? Math.round(allDwell / uniqueVisitors) : 0,
    completionRate: rows.length ? rows.filter((row) => row.completed).length / rows.length : 0,
  };
}

function group<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const name = key(row);
    const list = groups.get(name);
    if (list) list.push(row);
    else groups.set(name, [row]);
  }
  return groups;
}

function breakdown(rows: BlogAnalyticsEventRecord[], key: (row: BlogAnalyticsEventRecord) => string | null): BlogAnalyticsBreakdown[] {
  return Array.from(group(rows, (row) => key(row) || 'unknown'), ([name, groupRows]) => ({ key: name, ...totals(groupRows) }))
    .sort((a, b) => b.views - a.views);
}

function daily(rows: BlogAnalyticsEventRecord[]) {
  return Array.from(group(rows, (row) => row.openedAt.slice(0, 10)), ([day, dayRows]) => ({ day, ...totals(dayRows) }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

function windowRows(days: number, slug?: string) {
  const from = new Date(Date.now() - days * DAY).toISOString();
  const rows = analyticsEvents()
    .filter((row) => row.openedAt >= from && (!slug || row.slug === slug))
    .slice(0, 10_000);
  return { from, rows };
}

function analyticsSummary(params: URLSearchParams): BlogAnalyticsSummaryResult {
  const days = clampInt(params.get('days'), 30, 1, 365);
  const { from, rows } = windowRows(days);
  return {
    range: { from, to: rows[0]?.openedAt ?? null, days },
    totals: totals(rows),
    articles: Array.from(group(rows, (row) => row.slug), ([slug, articleRows]) => ({
      slug,
      ...totals(articleRows),
      topPlatform: breakdown(articleRows, (row) => row.platform)[0]?.key ?? null,
    })).sort((a, b) => b.views - a.views),
    platforms: breakdown(rows, (row) => row.platform),
    countries: breakdown(rows, (row) => row.country),
    referrers: breakdown(rows, (row) => row.refSource),
    daily: daily(rows),
    newsletter: DEMO_ANALYTICS.summary.newsletter,
    listening: DEMO_ANALYTICS.summary.listening,
  };
}

const SCROLL_BOUNDS = [0.25, 0.5, 0.75, 0.9, 1.01] as const;
const SCROLL_LABELS = ['0-25%', '25-50%', '50-75%', '75-90%', '90-100%'] as const;

function analyticsArticle(slug: string, params: URLSearchParams): BlogAnalyticsArticleDetailResult {
  const days = clampInt(params.get('days'), 30, 1, 365);
  const { from, rows } = windowRows(days, slug);
  const counts = SCROLL_LABELS.map(() => 0);
  for (const row of rows) {
    const index = SCROLL_BOUNDS.findIndex((bound) => row.scrollDepth < bound);
    counts[index === -1 ? counts.length - 1 : index] += 1;
  }
  return {
    slug,
    range: { from, to: rows[0]?.openedAt ?? null, days },
    totals: totals(rows),
    daily: daily(rows),
    referrers: breakdown(rows, (row) => row.refSource),
    platforms: breakdown(rows, (row) => row.platform),
    countries: breakdown(rows, (row) => row.country),
    scrollBuckets: SCROLL_LABELS.map((bucket, index) => ({ bucket, count: counts[index] })),
  };
}

/* ------------------------------------------------------------------ */
/* Notify gate                                                         */
/* ------------------------------------------------------------------ */

const GATE_CONFIG = { thresholdCount: 3, thresholdWindowMinutes: 60, autoReleaseAfterHours: 6 };
function seedGate(): NotifyGateStatus {
  return {
    channel: 'mood',
    state: 'held',
    heldSince: new Date(Date.now() - 2 * HOUR - 14 * MINUTE).toISOString(),
    heldPostIds: ['4127', '4128', '4131'],
    recentDispatchCount: 4,
    config: GATE_CONFIG,
  };
}
let gate = seedGate();
let releasedAt = 0;

/* A released gate re-closes on the next burst. In the demo that burst is
   simulated five minutes later, so the release flow can be tried again
   without restarting the dev server. */
function gateStatus(): NotifyGateStatus {
  if (gate.state === 'open' && releasedAt && Date.now() - releasedAt > 5 * MINUTE) {
    const base = 4131 + Math.floor((Date.now() - releasedAt) / MINUTE);
    gate = { ...gate, state: 'held', heldSince: new Date().toISOString(), heldPostIds: [String(base), String(base + 1), String(base + 2)] };
    releasedAt = 0;
  }
  return gate;
}

async function releaseGate(request: Request): Promise<Response> {
  const body = await request.json().catch(() => null) as { decision?: unknown } | null;
  const decision = body?.decision;
  if (typeof decision !== 'string' || !(NOTIFY_GATE_DECISIONS as readonly string[]).includes(decision)) {
    return fail(400, 'decision_required');
  }
  const current = gateStatus();
  const released = current.heldPostIds;
  gate = { ...current, state: 'open', heldSince: null, heldPostIds: [], recentDispatchCount: 0 };
  releasedAt = Date.now();
  const sent = decision === 'drop' ? 0 : decision === 'digest' ? 1_147 : 1_147 * released.length;
  return json({
    channel: 'mood',
    decision: decision as NotifyGateDecision,
    releaseId: `rel_${releasedAt.toString(36)}`,
    releasedPostIds: released,
    remainingHeldPostIds: [],
    sent,
    failed: 0,
    status: 'released',
    executionState: 'completed',
    gateState: 'open',
    actor: 'admin',
    releasedAt: new Date(releasedAt).toISOString(),
  });
}

/* ------------------------------------------------------------------ */
/* Audit                                                               */
/* ------------------------------------------------------------------ */

let audit: AuditEntry[] | null = null;

function auditEvents(): AuditEntry[] {
  if (audit) return audit;
  const random = rng(812);
  const now = Date.now();
  const names = ['lena.ortiz', 'devon', 'm.tanaka', 'noah.kim', 'priya', 'wei.zhang', 'sam.c', 'ines', 'jonas', 'yuki', 'omar', 'li.na'];
  const domains = ['fastmail.com', 'hey.com', 'gmail.com', 'proton.me', 'outlook.com', 'qq.com'];
  const rows: AuditEntry[] = [];
  let id = 1_200;
  for (let minutes = 7; minutes < 30 * 24 * 60; minutes += Math.round(60 + random() * 420)) {
    const email = `${names[Math.floor(random() * names.length)]}${Math.floor(random() * 90)}@${domains[Math.floor(random() * domains.length)]}`;
    const roll = random();
    const eventType: NotifyAuditEventType = roll < 0.42 ? 'subscription_confirmed' : roll < 0.84 ? 'subscribe_requested' : roll < 0.96 ? 'unsubscribed' : 'admin_update';
    const source = eventType === 'unsubscribed' ? 'link' : eventType === 'admin_update' ? 'admin' : random() < 0.8 ? 'web' : 'telegram';
    rows.push({ id: id--, eventType, email, emailHash: `h${id}`, source, createdAt: new Date(now - minutes * MINUTE).toISOString() });
  }
  audit = rows;
  return audit;
}

function listAudit(params: URLSearchParams): Response {
  const limit = clampInt(params.get('limit'), 20, 1, 100);
  const source = params.get('source')?.trim();
  const rows = source ? auditEvents().filter((row) => row.source === source) : auditEvents();
  return json({ events: rows.slice(0, limit) });
}

/* ------------------------------------------------------------------ */
/* Activity                                                            */
/* ------------------------------------------------------------------ */

const EMOJI = ['❤️', '👍', '🔥', '👀', '🎉'];
const READERS = ['Mira', 'jonas_k', 'Priya', '南风', 'Léa', null, null, null];
// Per store: a hot reload of demo-api.ts makes a fresh store while this
// module, unchanged, stays loaded.
const seeded = new WeakSet<OverviewStore>();
let lastTrickle = Date.now();

/** Back to the seed, for demo-api.ts's reset. The activity log lives in
    demo-api.ts's store, which the reset replaces; a fresh store is seeded
    again on its first read. The analytics log and the audit are never
    written to. */
export function resetOverviewDemo(): void {
  gate = seedGate();
  releasedAt = 0;
  lastTrickle = Date.now();
}

function entry(fields: Partial<PortalActivityEntry> & Pick<PortalActivityEntry, 'id' | 'createdAt' | 'event' | 'actor' | 'targetType' | 'targetId'>): PortalActivityEntry {
  return {
    source: 'web', postId: null, postTitle: null, postSlug: null, displayName: null, readerId: null,
    anonymous: false, emoji: null, status: null, reason: null, note: null,
    ...fields,
  };
}

/* The log a real month leaves: every comment's create and verdict, and a
   steady run of likes, some taken back. Built from the comment store so an
   entry's comment exists when the row links to it. */
function seedActivity(store: OverviewStore): void {
  if (seeded.has(store)) return;
  seeded.add(store);
  const random = rng(4242);
  const now = Date.now();
  const seen = new Set(store.activity.map((row) => row.id));
  const rows: PortalActivityEntry[] = [];
  const posts = new Map(store.comments.map((row) => [row.postId, row]));

  for (const comment of store.comments) {
    const at = Date.parse(comment.createdAt);
    const common = {
      targetType: 'comment' as const,
      targetId: comment.id,
      postId: comment.postId,
      postTitle: comment.postTitle,
      postSlug: comment.postSlug,
      displayName: comment.author,
      readerId: comment.actor.readerId,
    };
    rows.push(entry({ ...common, id: `ac_c_${comment.id}`, createdAt: comment.createdAt, event: 'comment.create', actor: 'reader', anonymous: comment.actor.readerId === null, status: 'held' }));
    const verdict = comment.status === 'deleted' ? 'published' : comment.status;
    rows.push(entry({
      ...common,
      id: `ac_m_${comment.id}`,
      createdAt: new Date(at + 2_000 + random() * 6_000).toISOString(),
      event: 'comment.moderate',
      actor: 'model',
      source: 'cron',
      status: verdict,
      reason: comment.moderationReason,
      note: comment.moderationNote,
    }));
    if (comment.status === 'deleted') {
      rows.push(entry({ ...common, id: `ac_d_${comment.id}`, createdAt: new Date(at + HOUR * (1 + random() * 20)).toISOString(), event: 'comment.delete', actor: 'owner', source: random() < 0.5 ? 'portal' : 'telegram', status: 'deleted' }));
    }
  }

  const postList = [...posts.values()];
  const oldest = Math.min(...store.comments.map((row) => Date.parse(row.createdAt)));
  for (let index = 0; index < 180; index += 1) {
    const at = now - random() * (now - oldest);
    const onComment = random() < 0.35 ? store.comments[Math.floor(random() * store.comments.length)] : null;
    const post = onComment ?? postList[Math.floor(random() * postList.length)];
    const name = READERS[Math.floor(random() * READERS.length)];
    const readerId = name ? `reader-${(name.codePointAt(0) ?? 0).toString(16).padStart(6, '0')}` : null;
    const removed = random() < 0.08;
    rows.push(entry({
      id: `ac_r_${index}`,
      createdAt: new Date(at).toISOString(),
      event: removed ? 'reaction.remove' : 'reaction.add',
      actor: 'reader',
      targetType: onComment ? 'comment' : 'post',
      targetId: onComment ? onComment.id : post.postId,
      postId: post.postId,
      postTitle: post.postTitle,
      postSlug: post.postSlug,
      displayName: name,
      readerId,
      anonymous: !readerId,
      emoji: EMOJI[Math.floor(random() * EMOJI.length)],
    }));
  }

  store.activity = [...store.activity, ...rows.filter((row) => !seen.has(row.id))]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/* A like every half minute or so while someone is reading the feed, so the
   live refresh has something to show. */
function trickle(store: OverviewStore): void {
  const now = Date.now();
  if (now - lastTrickle < 25_000) return;
  lastTrickle = now;
  const post = store.comments[Math.floor(Math.random() * Math.min(12, store.comments.length))];
  if (!post) return;
  const name = READERS[Math.floor(Math.random() * READERS.length)];
  const readerId = name ? `reader-${(name.codePointAt(0) ?? 0).toString(16).padStart(6, '0')}` : null;
  store.activity.unshift(entry({
    id: `ac_live_${now.toString(36)}`,
    createdAt: new Date(now).toISOString(),
    event: 'reaction.add',
    actor: 'reader',
    targetType: 'post',
    targetId: post.postId,
    postId: post.postId,
    postTitle: post.postTitle,
    postSlug: post.postSlug,
    displayName: name,
    readerId,
    anonymous: !readerId,
    emoji: EMOJI[Math.floor(Math.random() * EMOJI.length)],
  }));
}

function activitySummary(rows: PortalActivityEntry[]): PortalActivitySummary {
  const byEvent = Object.fromEntries(ACTIVITY_EVENTS.map((event) => [event, 0])) as Record<PortalActivityEvent, number>;
  for (const row of rows) byEvent[row.event] += 1;
  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);
  const since = new Date(Date.now() - 14 * DAY);
  since.setUTCHours(0, 0, 0, 0);
  const days = new Map<string, { date: string; comments: number; reactions: number }>();
  for (const row of rows) {
    if (row.createdAt < since.toISOString()) continue;
    const date = row.createdAt.slice(0, 10);
    const day = days.get(date) ?? { date, comments: 0, reactions: 0 };
    if (row.event.startsWith('reaction.')) day.reactions += 1;
    else day.comments += 1;
    days.set(date, day);
  }
  return {
    byEvent,
    today: rows.filter((row) => row.createdAt >= midnight.toISOString()).length,
    reactionsNet: byEvent['reaction.add'] - byEvent['reaction.remove'],
    daily: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

function listActivity(store: OverviewStore, params: URLSearchParams): Response {
  seedActivity(store);
  trickle(store);
  const family = params.get('family');
  const event = params.get('event');
  const targetType = params.get('targetType');
  if (family && family !== 'all' && family !== 'comments' && family !== 'reactions') return fail(400, 'invalid_family');
  if (event && !(ACTIVITY_EVENTS as readonly string[]).includes(event)) return fail(400, 'invalid_event');
  if (targetType && targetType !== 'comment' && targetType !== 'post') return fail(400, 'invalid_target_type');
  const targetId = params.get('targetId');
  const readerId = params.get('readerId');
  const limit = clampInt(params.get('limit'), 50, 1, 200);
  const offset = clampInt(params.get('offset'), 0, 0, 1_000_000);

  const rows = store.activity.filter((row) =>
    (event ? row.event === event : !family || family === 'all' || row.event.startsWith(family === 'comments' ? 'comment.' : 'reaction.'))
    && (!targetType || row.targetType === targetType)
    && (!targetId || row.targetId === targetId)
    && (!readerId || row.readerId === readerId));
  const page = rows.slice(offset, offset + limit);
  return json({
    summary: activitySummary(store.activity),
    entries: page,
    total: rows.length,
    nextOffset: offset + page.length < rows.length ? offset + page.length : null,
  });
}

/* ------------------------------------------------------------------ */
/* Dispatch                                                            */
/* ------------------------------------------------------------------ */

/** Answers the paths this module owns, or null to let demo-api.ts go on.
    `segments` is the decoded path below `/api/`. */
export async function handleOverviewDemo(request: Request, segments: string[], store: OverviewStore): Promise<Response | null> {
  const method = request.method.toUpperCase();
  const params = new URL(request.url).searchParams;
  const [root, resource, ...rest] = segments;

  if (root === 'analytics') {
    if (method !== 'GET') return fail(405, 'method_not_allowed');
    if (resource === 'summary' && rest.length === 0) return json(analyticsSummary(params));
    if (resource === 'events' && rest.length === 0) {
      return json({ events: analyticsEvents().slice(0, clampInt(params.get('limit'), 50, 1, 200)) });
    }
    if (resource === 'article' && rest.length === 1) return json(analyticsArticle(rest[0], params));
    return fail(404, 'not_found');
  }

  if (root !== 'admin') return null;
  if (resource === 'activity' && method === 'GET' && rest.length === 0) return listActivity(store, params);
  if (resource === 'audit' && method === 'GET') return listAudit(params);
  if (resource === 'notify-gate') {
    if (rest.length === 0 && method === 'GET') return json(gateStatus());
    if (rest[0] === 'release' && method === 'POST') return releaseGate(request);
  }
  return null;
}
