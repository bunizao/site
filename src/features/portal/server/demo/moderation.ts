/* Demo answers for the moderation screens: reactions, bans, ban operations
   and comment insights. Stateful where the real API is (a lifted ban stays
   lifted, a restored operation stays restored) and computed from one seeded
   data set where it reads, so a pivot from an insights row lands on rows
   that add up to the number that was clicked.

   The story matches portal-demo.ts: a rented /24 at DigitalOcean in
   Singapore mints fresh sessions to tap hearts on one post, and an ordinary
   readership does not. Shapes and error codes follow site-api main
   (src/pages/admin/{bans,reactions,comments/insights}); keep them in step.

   Imported only behind `import.meta.env.DEV`, like demo-api.ts. */

import type {
  AdminBan,
  AdminBanInput,
  AdminBanKeyType,
  AdminBanOperation,
  AdminBanPreview,
  AdminBanResult,
  AdminCommentActor,
  AdminCommentInsights,
  AdminCommentInsightsWindow,
  AdminCommentQuality,
  AdminInsightRow,
  AdminReactionInsights,
  AdminReactionInsightsWindow,
  AdminReactionRecord,
  AdminSourceKeyType,
} from '@bunizao/contracts';
import { DEMO_BANS, DEMO_COMMENT_INSIGHTS, demoActor } from '@/features/admin/server/portal-demo';

const HOUR = 3_600_000;
const DAY = 86_400_000;

function rng(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Portal-Demo': '1' },
  });
}

function error(status: number, code: string, message = code): Response {
  return json({ error: code, message }, status);
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(raw);
  if (raw === null || raw === '' || !Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function distinct<T>(values: T[]): number {
  return new Set(values.filter((value) => value !== null && value !== undefined)).size;
}

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------

const POSTS = [
  { id: '665f0a11', title: 'The retry budget nobody wrote down', slug: 'retry-budget' },
  { id: '661c48d2', title: 'One abstraction fewer', slug: 'one-abstraction-fewer' },
  { id: '6708be93', title: 'Shipping on a Friday, on purpose', slug: 'shipping-on-friday' },
  { id: '66a1f0c4', title: '写给三年后的自己', slug: 'note-to-future-self' },
  { id: '66b77d20', title: 'Cloudflare Workers 的冷启动其实不冷', slug: 'workers-cold-start' },
  { id: '66c90e5b', title: 'Why I stopped using ORMs', slug: 'stopped-using-orms' },
];

/** Comments in DEMO_COMMENTS, so a comment target opens a real row. */
const COMMENT_TARGETS = [
  { id: '01J8QK3M7X', postId: '665f0a11' },
  { id: '01J8QM0P4A', postId: '661c48d2' },
  { id: '01J8QN9R2C', postId: '665f0a11' },
];

const PLACES: Array<[country: string, city: string, asn: number, org: string, net: string]> = [
  ['AU', 'Melbourne', 4764, 'Aussie Broadband', '203.0.113'],
  ['AU', 'Sydney', 1221, 'Telstra', '203.2.75'],
  ['DE', 'Berlin', 3320, 'Deutsche Telekom', '91.64.12'],
  ['JP', 'Tokyo', 2516, 'KDDI', '106.72.4'],
  ['US', 'Portland', 7922, 'Comcast', '73.25.160'],
  ['CN', 'Hangzhou', 4134, 'China Telecom', '115.192.40'],
  ['TW', 'Taipei', 3462, 'Chunghwa Telecom', '114.34.8'],
  ['GB', 'London', 2856, 'BT', '86.128.33'],
  ['SG', 'Singapore', 9506, 'Singtel', '116.86.2'],
  ['IN', 'Bengaluru', 24560, 'Bharti Airtel', '122.171.9'],
];

const DEVICES: Record<string, { renderer: string; screen: string; platform: string }> = {
  macOS: { renderer: 'Apple M3', screen: '1728x1117', platform: 'MacIntel' },
  Windows: { renderer: 'ANGLE (NVIDIA RTX 3060)', screen: '1920x1080', platform: 'Win32' },
  iOS: { renderer: 'Apple GPU', screen: '390x844', platform: 'iPhone' },
  Android: { renderer: 'Adreno 740', screen: '412x915', platform: 'Linux armv8l' },
  Linux: { renderer: 'Mesa Intel UHD 620', screen: '1920x1080', platform: 'Linux x86_64' },
  bot: { renderer: 'SwiftShader', screen: '1280x1024', platform: 'Linux x86_64' },
};

const BROWSERS: Array<[string, string]> = [
  ['Safari 18', 'macOS'], ['Chrome 128', 'Windows'], ['Safari 18', 'iOS'],
  ['Chrome 128', 'Android'], ['Firefox 130', 'Linux'], ['Edge 128', 'Windows'],
];

const CIPHERS: Record<string, string> = {
  'Safari 18': 'JZtiTn8H', 'Chrome 128': 'Pq2Lw7Ra', 'Firefox 130': 'mF40cc1e', 'Edge 128': 'Pq2Lw7Ra', bot: 'QQ91xz02',
};

interface DemoReaction extends AdminReactionRecord {
  /** Demo-only facts the insights read; stripped before a list answers. */
  facts: { os: string; bot: boolean; tapMs: number; auth: 'turnstile' | 'pass' | 'verified'; sampleIp: string };
}

function generateReactions(now: number): DemoReaction[] {
  const random = rng(20260929);
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
  const hex = (n: number) => Math.floor(random() * 16 ** n).toString(16).padStart(n, '0');
  const rows: DemoReaction[] = [];

  const target = (postIndex: number | null) => {
    if (postIndex === null && random() < 0.3) {
      const comment = pick(COMMENT_TARGETS);
      const post = POSTS.find((entry) => entry.id === comment.postId)!;
      return { targetType: 'comment' as const, targetId: comment.id, post };
    }
    const post = postIndex === null ? pick(POSTS) : POSTS[postIndex];
    return { targetType: 'post' as const, targetId: post.id, post };
  };

  // An ordinary readership: 46 people, a few reactions each, over a week.
  for (let person = 0; person < 46; person += 1) {
    const [country, city, asn, asOrg, net] = pick(PLACES);
    const [browser, os] = pick(BROWSERS);
    const verified = random() < 0.25;
    // Readers in one city share one of two subnets.
    const second = random() < 0.5;
    const [a, b, c] = net.split('.').map(Number);
    const ip = `${a}.${b}.${c + (second ? 1 : 0)}.${Math.floor(random() * 250) + 2}`;
    const keys = {
      session: hex(8), ip: hex(8), fp: hex(8), clientFp: hex(8), clientFpStable: hex(8),
      ip24: `${(asn * 7).toString(16).padStart(6, '0').slice(-6)}${second ? 'b1' : 'a0'}`,
    };
    const actor = demoActor({
      authAtWrite: verified ? 'verified' : 'anonymous',
      readerId: verified ? `reader-${hex(6)}` : null,
      ip, country, city, asn, asOrg, browser, os,
      sessionNew: random() < 0.15,
      keys,
    });
    const count = 1 + Math.floor(random() * 4);
    for (let i = 0; i < count; i += 1) {
      const where = target(null);
      const hoursAgo = random() * 7 * 24;
      rows.push({
        id: '',
        targetType: where.targetType,
        targetId: where.targetId,
        postId: where.post.id,
        postTitle: where.post.title,
        postSlug: where.post.slug,
        emoji: '❤️',
        createdAt: new Date(now - hoursAgo * HOUR).toISOString(),
        actor,
        facts: { os, bot: false, tapMs: 4_000 + random() * 90_000, auth: verified ? 'verified' : random() < 0.8 ? 'pass' : 'turnstile', sampleIp: ip },
      });
    }
  }

  // The stuffing run: fresh sessions from one rented /24, one heart each on
  // the same post, four minutes apart, from 26 to 22 hours ago.
  const burstStart = now - 26 * HOUR;
  for (let index = 0; index < 58; index += 1) {
    const session = index === 0 ? 'aa01bb02' : hex(8);
    const ip = `198.51.100.${24 + (index % 3)}`;
    const actor = demoActor({
      ip, country: 'SG', city: 'Singapore', asn: 14061, asOrg: 'DigitalOcean',
      browser: 'Chrome 128', os: 'Linux', sessionNew: true, botHints: 2 + (index % 2),
      keys: { session, ip: index % 3 === 0 ? 'c0ffee01' : `c0ffee1${index % 3}`, ip24: 'c0ffee02', fp: 'deadbeef', clientFp: 'f00dcafe', clientFpStable: 'f00dcaf0' },
      cluster: { ip24: { comments: 6, held: 6, reactions: 57 } },
    });
    const onComment = index % 5 === 4;
    rows.push({
      id: '',
      targetType: onComment ? 'comment' : 'post',
      targetId: onComment ? '01J8QK3M7X' : '665f0a11',
      postId: '665f0a11',
      postTitle: POSTS[0].title,
      postSlug: POSTS[0].slug,
      emoji: '❤️',
      createdAt: new Date(burstStart + index * 4 * 60_000 + random() * 50_000).toISOString(),
      actor,
      facts: { os: 'bot', bot: true, tapMs: 200 + random() * 500, auth: 'turnstile', sampleIp: ip },
    });
  }

  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  rows.forEach((row, index) => {
    row.id = `01J9RX${String(rows.length - index).padStart(4, '0')}${row.actor.keys.session?.slice(0, 4).toUpperCase() ?? 'ANON'}`;
  });
  return rows;
}

const SOURCE_KEYS = new Set<string>([
  'email', 'session', 'ip', 'ip24', 'fp', 'asn', 'client_fp', 'domain', 'email_domain', 'client_fp_stable', 'storage_id', 'body_hash',
]);

/** Reactions carry no email, link domains or body, so those keys match none. */
function reactionMatches(actor: AdminCommentActor, type: AdminSourceKeyType, value: string): boolean {
  switch (type) {
    case 'session': return actor.keys.session === value;
    case 'ip': return actor.keys.ip === value;
    case 'ip24': return actor.keys.ip24 === value;
    case 'fp': return actor.keys.fp === value;
    case 'client_fp': return actor.keys.clientFp === value || actor.keys.clientFpStable === value;
    case 'client_fp_stable': return actor.keys.clientFpStable === value;
    case 'storage_id': return actor.keys.storageId === value;
    case 'asn': return String(actor.asn ?? '') === value;
    default: return false;
  }
}

function publicReaction({ facts: _facts, ...row }: DemoReaction): AdminReactionRecord {
  return row;
}

function listReactions(params: URLSearchParams): Response {
  const targetType = params.get('targetType');
  if (targetType && targetType !== 'post' && targetType !== 'comment') return error(400, 'invalid_target_type');
  const key = params.get('key');
  if (key && !SOURCE_KEYS.has(key)) return error(400, 'invalid_key');
  const value = params.get('value');
  const targetId = params.get('targetId');
  const limit = clampInt(params.get('limit'), 25, 1, 100);
  const offset = clampInt(params.get('offset'), 0, 0, 100_000);

  let rows = store.reactions;
  if (targetType) rows = rows.filter((row) => row.targetType === targetType);
  if (targetId) rows = rows.filter((row) => row.targetId === targetId);
  if (key && value) rows = rows.filter((row) => reactionMatches(row.actor, key as AdminSourceKeyType, value));
  const page = rows.slice(offset, offset + limit);
  return json({
    reactions: page.map(publicReaction),
    total: rows.length,
    nextOffset: offset + page.length < rows.length ? offset + page.length : null,
  });
}

function reactionRow<T>(rows: DemoReaction[], group: (row: DemoReaction) => string, extra: (first: DemoReaction, members: DemoReaction[]) => T) {
  const groups = new Map<string, DemoReaction[]>();
  for (const row of rows) {
    const id = group(row);
    groups.set(id, [...(groups.get(id) ?? []), row]);
  }
  return [...groups.values()]
    .map((members) => ({
      count: members.length,
      held: null,
      heldRate: null,
      sessions: distinct(members.map((member) => member.actor.keys.session)),
      ...extra(members[0], members),
    }) satisfies AdminInsightRow & T)
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
}

function reactionInsights(params: URLSearchParams): Response {
  const raw = params.get('window') ?? '48h';
  if (raw !== '48h' && raw !== '7d') return error(400, 'invalid_window');
  const window = raw as AdminReactionInsightsWindow;
  const now = Date.now();
  const since = now - (window === '48h' ? 2 : 7) * DAY;
  const rows = store.reactions.filter((row) => Date.parse(row.createdAt) >= since);

  const byHour = new Map<string, DemoReaction[]>();
  const byDay = new Map<string, DemoReaction[]>();
  for (const row of rows) {
    const hour = row.createdAt.slice(0, 13);
    byHour.set(hour, [...(byHour.get(hour) ?? []), row]);
    const day = row.createdAt.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), row]);
  }
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));

  const targets = new Map<string, DemoReaction[]>();
  for (const row of rows) {
    const id = `${row.targetType}:${row.targetId}`;
    targets.set(id, [...(targets.get(id) ?? []), row]);
  }

  const counted = <K extends string>(values: K[]) => {
    const counts = new Map<K, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  };

  const result: AdminReactionInsights = {
    window,
    since: new Date(since).toISOString(),
    hourly: [...byHour.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hour, members]) => ({
        hour,
        reactions: members.length,
        sessions: distinct(members.map((member) => member.actor.keys.session)),
        subnets: distinct(members.map((member) => member.actor.keys.ip24)),
      })),
    authMix: days.map(([day, members]) => ({
      day,
      turnstile: members.filter((member) => member.facts.auth === 'turnstile').length,
      pass: members.filter((member) => member.facts.auth === 'pass').length,
      verified: members.filter((member) => member.facts.auth === 'verified').length,
    })),
    targets: [...targets.values()]
      .map((members) => ({
        targetType: members[0].targetType,
        targetId: members[0].targetId,
        postTitle: members[0].postTitle,
        reactions: members.length,
        subnets: distinct(members.map((member) => member.actor.keys.ip24)),
        fps: distinct(members.map((member) => member.actor.keys.clientFp)),
      }))
      .sort((a, b) => b.reactions - a.reactions)
      .slice(0, 10),
    networks: reactionRow(rows, (row) => String(row.actor.asn), (first) => ({ asn: first.actor.asn, asOrg: first.actor.asOrg })),
    countries: reactionRow(rows, (row) => row.actor.country ?? '', (first) => ({ country: first.actor.country })),
    subnets: reactionRow(rows, (row) => row.actor.keys.ip24 ?? '', (first) => ({ ip24: first.actor.keys.ip24, sampleIp: first.facts.sampleIp })),
    browsers: reactionRow(rows, (row) => `${row.actor.browser}|${row.actor.os}`, (first) => ({ browser: first.actor.browser, os: first.actor.os })),
    devices: reactionRow(rows, (row) => row.actor.keys.clientFp ?? '', (first, members) => ({
      clientFp: first.actor.keys.clientFp,
      ...DEVICES[first.facts.os],
      subnets: distinct(members.map((member) => member.actor.keys.ip24)),
    })),
    botHints: [
      ...counted(rows.filter((row) => row.facts.bot).flatMap((row) => ['no_input_events', ...(row.facts.tapMs < 1000 ? ['instant_tap'] : [])])),
    ].map(([hint, count]) => ({ hint, count })),
    tlsStacks: counted(rows.map((row) => (row.facts.bot ? 'bot' : row.actor.browser ?? 'unknown'))).map(([browser, count]) => ({
      browser: browser === 'bot' ? 'Chrome 128' : browser,
      ciphersSha1: CIPHERS[browser] ?? null,
      count,
    })),
    sessionAge: days.map(([day, members]) => ({
      day,
      writes: members.length,
      newShare: members.filter((member) => member.actor.sessionNew).length / members.length,
    })),
    timeToTap: (['< 1s', '1–5s', '5–30s', '> 30s'] as const).map((bucket, index) => {
      const limits = [0, 1_000, 5_000, 30_000, Infinity];
      const members = rows.filter((row) => row.facts.tapMs >= limits[index] && row.facts.tapMs < limits[index + 1]);
      return { bucket, count: members.length, sessions: distinct(members.map((member) => member.actor.keys.session)) };
    }),
  };
  return json(result);
}

// ---------------------------------------------------------------------------
// Bans and ban operations
// ---------------------------------------------------------------------------

const BAN_TYPES = new Set<string>(['email', 'session', 'ip', 'ip24', 'fp', 'asn', 'client_fp', 'domain', 'email_domain']);

/** Email domains with more than ten published comments in the demo. */
const PROTECTED_DOMAINS: Record<string, number> = { 'gmail.com': 88, 'qq.com': 31, 'outlook.com': 14 };

function seedBans(now: number): AdminBan[] {
  const random = rng(4242);
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(random() * 16).toString(16)).join('');
  const at = (days: number) => new Date(now - days * DAY).toISOString();
  const extra: Array<[AdminBanKeyType, string, string | null, 'portal' | 'telegram' | 'script', number, number | null, number]> = [
    ['session', hex(16), 'Posted the same link on six posts', 'telegram', 1.2, -29, 4],
    ['session', hex(16), null, 'portal', 3, -4, 0],
    ['client_fp', hex(16), 'Headless Chrome, rotates sessions', 'portal', 4, null, 18],
    ['ip', hex(16), 'Abuse in Chinese, three nights running', 'portal', 5, -2.4, 9],
    ['email', hex(16), 'Confirmed address, harassment', 'portal', 6, null, 2],
    ['fp', hex(16), null, 'script', 8, -0.6, 1],
    ['asn', '9009', 'M247, proxy exits only', 'portal', 11, null, 12],
    ['asn', '16276', 'OVH, audit spam wave', 'telegram', 13, -17, 6],
    ['domain', 'seo-boost.example', 'Backlink seller', 'portal', 14, null, 7],
    ['domain', 'cheap-backlinks.example', null, 'telegram', 15, null, 3],
    ['domain', 't.me', 'Crypto signal groups', 'portal', 16, -14, 11],
    ['email_domain', 'tempmail.example', 'Disposable', 'script', 18, null, 5],
    ['email_domain', 'guerrillamail.example', 'Disposable', 'script', 18, null, 0],
    ['ip24', hex(16), 'University NAT, one bad actor, short ban', 'portal', 20, -1.5, 3],
    ['session', hex(16), null, 'telegram', 22, 8, 0],
    ['ip', hex(16), 'Scraper that also comments', 'portal', 24, 6, 2],
    ['client_fp', hex(16), null, 'portal', 27, 3, 0],
    ['session', hex(16), 'Test ban from the phone', 'telegram', 31, 24, 0],
    ['domain', 'growth-leads.example', 'Outbound offer link', 'portal', 34, 4, 1],
    ['email', hex(16), null, 'portal', 38, 31, 0],
    ['asn', '14618', 'AWS us-east-1, bot traffic', 'portal', 41, -49, 26],
    ['fp', hex(16), 'Same headers as the audit spam', 'portal', 45, null, 4],
  ];
  return [
    ...structuredClone(DEMO_BANS.bans),
    ...extra.map(([keyType, keyValue, note, source, age, expiresIn, hits]) => ({
      keyType,
      keyValue,
      note,
      source,
      createdAt: at(age),
      // Negative "age" of expiry means days from now; positive is in the past.
      expiresAt: expiresIn === null ? null : new Date(now - expiresIn * DAY).toISOString(),
      hits,
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function seedOperations(now: number): AdminBanOperation[] {
  const at = (days: number) => new Date(now - days * DAY).toISOString();
  return [
    {
      id: '7b0c1f7e-demo-4a51-9e2c-applied00001',
      createdAt: at(2),
      source: 'portal',
      keys: [{ type: 'ip24', value: 'c0ffee02' }, { type: 'client_fp', value: 'f00dcaf0' }],
      note: 'Audit-spam /24, rented',
      purged: { comments: 6, reactions: 41 },
      restoredAt: null,
      restorableUntil: at(2 - 30),
      restored: { comments: 0, reactions: 0 },
      skipped: { comments: 0, reactions: 0 },
    },
    {
      id: '5e61aa02-demo-4f0d-8c11-applied00002',
      createdAt: at(9),
      source: 'telegram',
      keys: [{ type: 'session', value: '3f9c2a7d11e04b6a' }],
      note: 'Posted the same link on six posts',
      purged: { comments: 6, reactions: 0 },
      restoredAt: null,
      restorableUntil: at(9 - 30),
      restored: { comments: 0, reactions: 0 },
      skipped: { comments: 0, reactions: 0 },
    },
    {
      id: '2c9d7b13-demo-47e8-b0aa-restored0003',
      createdAt: at(15),
      source: 'portal',
      keys: [{ type: 'email', value: '8e1f0c55a2b34d9e' }, { type: 'session', value: '0a1b2c3d4e5f6071' }],
      note: 'Wrong person, the address was shared',
      purged: { comments: 4, reactions: 2 },
      restoredAt: at(12),
      restorableUntil: at(15 - 30),
      restored: { comments: 3, reactions: 2 },
      skipped: { comments: 1, reactions: 0 },
    },
    {
      id: '91aa0e4c-demo-4c77-a3d2-expired00004',
      createdAt: at(41),
      source: 'script',
      keys: [{ type: 'domain', value: 'moonpump.example' }],
      note: null,
      purged: { comments: 9, reactions: 0 },
      restoredAt: null,
      restorableUntil: at(11),
      restored: { comments: 0, reactions: 0 },
      skipped: { comments: 0, reactions: 0 },
    },
  ];
}

/** Rows a key reaches: reactions from the demo set, comments from a hash of
    the key so every value gets a stable, plausible count. */
function reach(type: AdminBanKeyType, value: string): { comments: number; held: number; reactions: number; sessions: number } {
  const reactions = store.reactions.filter((row) => reactionMatches(row.actor, type, value));
  let hash = 0;
  for (const char of `${type}:${value}`) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const broad = type === 'asn' || type === 'ip24' || type === 'email_domain' || type === 'domain';
  const comments = broad ? 3 + (hash % 20) : hash % 4;
  const held = Math.min(comments, Math.round(comments * (0.4 + (hash % 5) / 10)));
  return {
    comments,
    held,
    reactions: reactions.length,
    sessions: Math.max(distinct(reactions.map((row) => row.actor.keys.session)), comments > 0 ? 1 : 0),
  };
}

function readKeys(input: Partial<AdminBanInput> | null): Array<{ type: AdminBanKeyType; value: string }> | Response {
  const keys = Array.isArray(input?.keys) ? input.keys : [];
  if (keys.length === 0) return error(400, 'keys_required');
  if (!keys.every((key) => BAN_TYPES.has(key?.type) && typeof key?.value === 'string' && key.value.length > 0 && key.value.length <= 512)) {
    return error(400, 'invalid_key', 'Each ban key must have a supported type and a nonempty value.');
  }
  const unique = [...new Map(keys.map((key) => [`${key.type}:${key.value}`, key])).values()];
  if (unique.length > 20) return error(400, 'too_many_keys', 'Select at most 20 distinct ban keys.');
  for (const key of unique) {
    const published = key.type === 'email_domain' ? PROTECTED_DOMAINS[key.value] : undefined;
    if (published) {
      return error(400, 'protected_email_domain', `Cannot ban ${key.value}: ${published} published comments in the last 90 days.`);
    }
  }
  return unique;
}

function preview(keys: Array<{ type: AdminBanKeyType; value: string }>): AdminBanPreview {
  const parts = keys.map((key) => reach(key.type, key.value));
  const comments = parts.reduce((sum, part) => sum + part.comments, 0);
  const held = parts.reduce((sum, part) => sum + part.held, 0);
  const reactions = parts.reduce((sum, part) => sum + part.reactions, 0);
  const published = Math.max(0, comments - held - (comments > 2 ? 1 : 0));
  const rejected = comments - held - published;
  const purge = { comments, reactions };
  return {
    accounts: keys.some((key) => key.type === 'email') ? 1 : 0,
    sessions: parts.reduce((sum, part) => sum + part.sessions, 0),
    comments: { total: comments, published, held, rejected, deleted: 0 },
    reactions,
    purge,
    windowDays: 90,
    purgeLimit: 500,
    purgeAllowed: purge.comments + purge.reactions <= 500,
  };
}

async function createBans(request: Request): Promise<Response> {
  const input = (await request.json().catch(() => null)) as Partial<AdminBanInput> | null;
  const keys = readKeys(input);
  if (keys instanceof Response) return keys;
  const now = new Date();
  const expiresAt = input?.expiresAt === undefined ? new Date(now.getTime() + 7 * DAY).toISOString() : input.expiresAt;
  const note = typeof input?.note === 'string' ? input.note : null;

  const bans: AdminBan[] = keys.map((key) => ({
    keyType: key.type,
    keyValue: key.value,
    note,
    source: 'portal',
    createdAt: now.toISOString(),
    expiresAt,
    hits: (() => {
      const part = reach(key.type, key.value);
      return part.comments + part.reactions;
    })(),
  }));
  // An existing pair keeps its created_at and takes the new note and expiry.
  for (const ban of bans) {
    const existing = store.bans.find((row) => row.keyType === ban.keyType && row.keyValue === ban.keyValue);
    if (existing) Object.assign(existing, { note: ban.note, expiresAt: ban.expiresAt, hits: ban.hits });
    else store.bans.unshift({ ...ban });
  }

  let operation: AdminBanOperation | null = null;
  if (input?.purge === true) {
    const impact = preview(keys);
    if (!impact.purgeAllowed) {
      return error(409, 'impact_too_large', 'This selection exceeds the 500-row purge limit. Choose narrower keys or apply the ban without purging.');
    }
    operation = {
      id: crypto.randomUUID(),
      createdAt: now.toISOString(),
      source: 'portal',
      keys,
      note,
      purged: impact.purge,
      restoredAt: null,
      restorableUntil: new Date(now.getTime() + 30 * DAY).toISOString(),
      restored: { comments: 0, reactions: 0 },
      skipped: { comments: 0, reactions: 0 },
    };
    store.operations.unshift(operation);
  }
  const result: AdminBanResult = { bans, purged: operation?.purged ?? { comments: 0, reactions: 0 }, operation };
  return json(result);
}

function restoreOperation(id: string): Response {
  const operation = store.operations.find((row) => row.id === id);
  if (!operation) return error(404, 'operation_not_found');
  if (operation.restoredAt) return json({ operation });
  if (operation.restorableUntil <= new Date().toISOString()) {
    return error(409, 'restore_expired', 'The 30-day content restore window has expired.');
  }
  // One comment was deleted again by hand in the meantime, as happens.
  const skippedComments = operation.purged.comments > 2 ? 1 : 0;
  operation.restoredAt = new Date().toISOString();
  operation.restored = { comments: operation.purged.comments - skippedComments, reactions: operation.purged.reactions };
  operation.skipped = { comments: skippedComments, reactions: 0 };
  return json({ operation });
}

async function bans(request: Request, method: string, rest: string[]): Promise<Response | null> {
  if (rest.length === 0 && method === 'GET') {
    return json({ bans: [...store.bans].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 500) });
  }
  if (rest.length === 0 && method === 'POST') return createBans(request);
  if (rest[0] === 'preview' && method === 'POST') {
    const input = (await request.json().catch(() => null)) as Partial<AdminBanInput> | null;
    const keys = readKeys(input);
    return keys instanceof Response ? keys : json(preview(keys));
  }
  if (rest[0] === 'operations' && rest.length === 1 && method === 'GET') {
    return json({ operations: store.operations.slice(0, 50) });
  }
  if (rest[0] === 'operations' && rest[2] === 'restore' && method === 'POST') return restoreOperation(rest[1]);
  if (rest.length === 2 && method === 'DELETE') {
    if (!BAN_TYPES.has(rest[0])) return error(400, 'invalid_key');
    const before = store.bans.length;
    store.bans = store.bans.filter((ban) => !(ban.keyType === rest[0] && ban.keyValue === rest[1]));
    return before === store.bans.length ? error(404, 'ban_not_found') : json({ removed: true });
  }
  return null;
}

// ---------------------------------------------------------------------------
// Comment insights
// ---------------------------------------------------------------------------

const WINDOW_DAYS: Record<AdminCommentInsightsWindow, number> = { '7d': 7, '30d': 30, '90d': 90 };

/** The fixture is a 30-day capture. Ordinary rows scale with the window;
    rows that are mostly held belong to last week's spam wave and barely
    change. */
function scale<T extends { count: number; held: number | null }>(rows: T[], days: number): T[] {
  return rows
    .map((row) => {
      const spam = row.held !== null && row.count > 0 && row.held / row.count > 0.5;
      const factor = spam ? Math.min(1, 0.75 + days / 120) : days / 30;
      const count = Math.max(1, Math.round(row.count * factor));
      const held = row.held === null ? null : Math.min(count, Math.round(row.held * factor));
      const next: T = { ...row, count, held };
      if ('heldRate' in next) Object.assign(next, { heldRate: held === null ? null : held / count });
      if ('sessions' in next && typeof next.sessions === 'number') {
        Object.assign(next, { sessions: Math.max(1, Math.min(count, Math.round(next.sessions * factor))) });
      }
      return next;
    })
    .sort((a, b) => b.count - a.count);
}

function commentDaily(days: number, now: number): AdminCommentInsights['dailyByStatus'] {
  const random = rng(7000 + days);
  const wave = [9, 14, 21, 6, 3];
  const rows: AdminCommentInsights['dailyByStatus'] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    // The real endpoint only returns days that had comments.
    if (offset > 6 && random() < 0.06) continue;
    const weekend = new Date(now - offset * DAY).getUTCDay() % 6 === 0;
    const inWave = offset >= 1 && offset <= 5;
    rows.push({
      day: new Date(now - offset * DAY).toISOString().slice(0, 10),
      published: Math.round((weekend ? 4 : 8) + random() * 6),
      held: inWave ? wave[5 - offset] : Math.round(random() * 1.4),
      rejected: inWave ? Math.round(wave[5 - offset] / 7) : random() < 0.12 ? 1 : 0,
      deleted: offset === 3 ? 4 : random() < 0.05 ? 1 : 0,
    });
  }
  return rows;
}

function commentQuality(days: number, now: number, daily: AdminCommentInsights['dailyByStatus']): AdminCommentQuality {
  const held = daily.reduce((sum, day) => sum + day.held, 0);
  const reviewed = Math.round(held * 0.82);
  const released = Math.round(reviewed * 0.11);
  const attempts = daily.reduce((sum, day) => sum + day.published + day.held + day.rejected + day.deleted, 0) + Math.round(days * 1.6);
  const failures = Math.round(attempts * 0.034);
  const authenticatedAttempts = Math.round(attempts * 0.31);
  const authenticatedFailures = Math.round(authenticatedAttempts * 0.012);
  const collected = now - 45 * DAY;
  const since = now - days * DAY;
  return {
    since: new Date(since).toISOString(),
    collectedSince: new Date(collected).toISOString(),
    available: { moderation: true, requests: true, clientReports: true },
    moderation: { held, reviewed, released, releasedShare: reviewed ? released / reviewed : null },
    requests: {
      attempts,
      failures,
      failureShare: attempts ? failures / attempts : null,
      authenticatedAttempts,
      authenticatedFailures,
      authenticatedFailureShare: authenticatedAttempts ? authenticatedFailures / authenticatedAttempts : null,
      outcomes: [
        { kind: 'comment' as const, outcome: 'published', count: attempts - failures - held },
        { kind: 'comment' as const, outcome: 'held', count: held },
        { kind: 'comment' as const, outcome: 'turnstile_failed', count: Math.round(failures * 0.6) },
        { kind: 'comment' as const, outcome: 'rate_limited', count: Math.round(failures * 0.3) },
        { kind: 'reaction' as const, outcome: 'recorded', count: Math.round(attempts * 2.4) },
        { kind: 'reaction' as const, outcome: 'ignored_banned', count: 41 },
      ].filter((row) => row.count > 0),
    },
    clientReports: {
      reports: Math.round(attempts * 0.4),
      failures: Math.round(attempts * 0.02),
      networkFailures: Math.round(attempts * 0.008),
      challengedAttempts: Math.round(attempts * 0.07),
      repeatedChallenges: Math.round(attempts * 0.012),
      untrusted: true,
    },
  };
}

function commentInsights(params: URLSearchParams): Response {
  const raw = params.get('window') ?? '30d';
  if (!(raw in WINDOW_DAYS)) return error(400, 'invalid_window');
  const window = raw as AdminCommentInsightsWindow;
  const days = WINDOW_DAYS[window];
  const now = Date.now();
  const base = DEMO_COMMENT_INSIGHTS;
  const daily = commentDaily(days, now);
  const weeks = Math.max(1, Math.floor(days / 7));

  const result: AdminCommentInsights = {
    ...base,
    window,
    since: new Date(now - days * DAY).toISOString(),
    quality: commentQuality(days, now, daily),
    networks: scale(base.networks, days),
    countries: scale(base.countries, days),
    subnets: scale(base.subnets, days),
    browsers: scale(base.browsers, days),
    devices: scale(base.devices, days),
    linkDomains: scale(base.linkDomains, days).map((row) => ({
      ...row,
      banned: store.bans.some((ban) => ban.keyType === 'domain' && ban.keyValue === row.domain),
    })),
    duplicates: scale(base.duplicates, days),
    emailDomains: scale(base.emailDomains, days).map((row) => ({
      ...row,
      banned: store.bans.some((ban) => ban.keyType === 'email_domain' && ban.keyValue === row.domain),
    })),
    botHints: scale(base.botHints, days),
    vpnHints: scale(base.vpnHints, days),
    tlsStacks: scale(base.tlsStacks, days),
    typing: scale(base.typing, days),
    dwell: scale(base.dwell, days),
    email: scale(base.email, days),
    dailyByStatus: daily,
    sessionAge: daily.map((day) => {
      const writes = day.published + day.held + day.rejected + day.deleted;
      return { day: day.day, writes, newShare: writes ? Math.min(0.97, 0.2 + day.held / writes) : 0 };
    }),
    overturns: Array.from({ length: Math.min(weeks, 12) }, (_, index) => ({
      week: new Date(now - (weeks - index) * 7 * DAY).toISOString().slice(0, 10),
      falsePositives: (index * 5 + 2) % 4,
      falseNegatives: index % 3 === 1 ? 1 : 0,
    })),
    banHits: store.bans
      .filter((ban) => ban.hits > 0 && (!ban.expiresAt || ban.expiresAt > new Date(now).toISOString()))
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 12)
      .map((ban) => ({ keyType: ban.keyType, keyValue: ban.keyValue, note: ban.note, hits: Math.max(1, Math.round(ban.hits * Math.min(1, days / 30 + 0.2))) })),
  };
  return json(result);
}

// ---------------------------------------------------------------------------

interface ModerationStore {
  reactions: DemoReaction[];
  bans: AdminBan[];
  operations: AdminBanOperation[];
}

function seedStore(now = Date.now()): ModerationStore {
  return { reactions: generateReactions(now), bans: seedBans(now), operations: seedOperations(now) };
}

let store = seedStore();

/** Back to the seed, for demo-api.ts's reset. */
export function resetModerationDemo(): void {
  store = seedStore();
}

/** The ban list as it stands, read-only, so demo/readers.ts can seed a
    revoked reader whose email ban outlives a restore. */
export function demoBans(): readonly AdminBan[] {
  return store.bans;
}

/** Answers the moderation routes, or null so demo-api.ts carries on.
    `rest` is the path below `admin/`, already split and decoded. */
export async function handleModerationDemo(request: Request, rest: string[], params: URLSearchParams): Promise<Response | null> {
  const method = request.method.toUpperCase();
  const [resource, ...tail] = rest;
  if (resource === 'reactions' && method === 'GET') {
    if (tail.length === 0) return listReactions(params);
    if (tail[0] === 'insights') return reactionInsights(params);
  }
  if (resource === 'comments' && tail[0] === 'insights' && method === 'GET') return commentInsights(params);
  if (resource === 'bans') return bans(request, method, tail);
  return null;
}
