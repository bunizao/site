/* The portal's demo API, for `astro dev` with no site-api behind it.

   It answers the same paths site-api does (`admin/*`, relative to `/api/`)
   from an in-memory store seeded once per dev-server process, so acting on a
   comment actually moves it and a reload shows the result. Shapes come from
   `@bunizao/contracts`; when a route grows a parameter in site-api, the demo
   learns it here too, or the UI is designed against something that does not
   exist.

   Imported only behind `import.meta.env.DEV`, so none of this is in a build. */

import type { AdminCommentRecord, AdminSourceKeyType } from '@bunizao/contracts';
import { DEMO_ACTIVITY, DEMO_COMMENTS, demoActor } from '@/features/admin/server/portal-demo';
import type {
  PortalActivityEntry,
  PortalCommentStatus,
  PortalCommentSummary,
} from '@/features/admin/server/portal-client';
import { enrichComments, ownerCode, resetOwnerCode, sourceProfile, withClusters } from './demo/comments';
import { handleAudienceDemo, resetAudienceDemo } from './demo/audience';
import { handleCommentAdminDemo } from './demo/comment-admin';
import { handleCommentControlsDemo } from './demo/controls';
import { handleMessagesDemo, resetMessagesDemo } from './demo/messages';
import { handleCommentModesDemo, resetCommentModesDemo } from './demo/modes';
import { handleModerationDemo, resetModerationDemo } from './demo/moderation';
import { handleOverviewDemo, resetOverviewDemo } from './demo/overview';
import { handleReadersDemo, resetReadersDemo } from './demo/readers';
import { handleToolsDemo, resetToolsDemo } from './demo/tools';

const LATENCY_MS = 140;
const HOUR = 3_600_000;

/* A seeded generator, so the demo queue is the same on every restart and a
   screenshot from yesterday still matches today's page. */
function rng(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

const POSTS = [
  { postId: '665f0a11', title: 'The retry budget nobody wrote down', slug: 'retry-budget' },
  { postId: '661c48d2', title: 'One abstraction fewer', slug: 'one-abstraction-fewer' },
  { postId: '6708be93', title: 'Shipping on a Friday, on purpose', slug: 'shipping-on-friday' },
  { postId: '66a1f0c4', title: '写给三年后的自己', slug: 'note-to-future-self' },
  { postId: '66b77d20', title: 'Cloudflare Workers 的冷启动其实不冷', slug: 'workers-cold-start' },
  { postId: '66c90e5b', title: 'Why I stopped using ORMs', slug: 'stopped-using-orms' },
];

const WRITERS = [
  { name: 'Mira', country: 'DE', city: 'Berlin', asn: 3320, asOrg: 'Deutsche Telekom', verified: true },
  { name: '小林', country: 'JP', city: 'Tokyo', asn: 2516, asOrg: 'KDDI', verified: false },
  { name: 'jonas_k', country: 'SE', city: 'Stockholm', asn: 3301, asOrg: 'Telia', verified: true },
  { name: '阿杰', country: 'TW', city: 'Taipei', asn: 3462, asOrg: 'Chunghwa Telecom', verified: false },
  { name: 'Priya', country: 'IN', city: 'Bengaluru', asn: 24560, asOrg: 'Bharti Airtel', verified: true },
  { name: 'tomasz', country: 'PL', city: 'Warsaw', asn: 5617, asOrg: 'Orange Polska', verified: false },
  { name: '南风', country: 'CN', city: 'Hangzhou', asn: 4134, asOrg: 'China Telecom', verified: true },
  { name: 'Sam Carter', country: 'US', city: 'Portland', asn: 7922, asOrg: 'Comcast', verified: false },
  { name: 'Léa', country: 'FR', city: 'Lyon', asn: 3215, asOrg: 'Orange', verified: true },
  { name: 'dev_hk', country: 'HK', city: 'Hong Kong', asn: 4760, asOrg: 'HKT', verified: false },
];

const GOOD_BODIES = [
  'This matches what I saw at my last job — nobody owned the retry policy, so every client invented one.',
  'Would love a follow-up on how you measure the budget in practice. Per route, or per upstream?',
  '写得很好。我们组去年也踩过同样的坑，最后是把重试统一收到网关层才解决。',
  'Small nit: the second code sample uses `await` outside an async function.',
  'I disagree with the conclusion, but the framing is the clearest I have read on this.',
  '同意作者的观点，不过我觉得第三段的例子举得有点极端了。',
  'Bookmarked. The table in the middle is going straight into our onboarding doc.',
  'Did you try this on Workers with Smart Placement on? Curious whether the numbers move.',
  '看完之后去翻了一下我们的代码，发现有四个地方各自在做同一件事……',
  'Thank you for writing the boring part down. That is the part that matters.',
  'How does this interact with idempotency keys? Retrying a POST without one is the real footgun.',
  '感觉 ORM 那段有点一刀切了，简单 CRUD 用 ORM 还是很省事的。',
];

const BAD_BODIES: Array<{ body: string; reason: string; note: string; model: string | null }> = [
  { body: 'Best crypto signals group!!! Join t.me/moonpumpsignals now, 300% guaranteed', reason: 'spam', note: 'Akismet: spam.', model: 'akismet' },
  { body: 'Nice post. Check my site https://cheap-backlinks.example for SEO packages starting at $5.', reason: 'promotional', note: 'Unsolicited service pitch with an outbound link.', model: 'task-guard' },
  { body: '这种垃圾文章也好意思发出来？作者脑子有问题吧', reason: 'abuse', note: 'Personal insult aimed at the author.', model: 'task-guard' },
  { body: 'What is the weather like in Melbourne today?', reason: 'off_topic', note: 'Unrelated to the post.', model: 'task-guard' },
  { body: 'My number is +61 400 000 000, call me to discuss', reason: 'personal_info', note: 'Contains a phone number.', model: 'task-guard' },
];

function generateComments(): AdminCommentRecord[] {
  const random = rng(20260928);
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
  const rows: AdminCommentRecord[] = [];
  const now = Date.now();

  for (let index = 0; index < 64; index += 1) {
    const post = pick(POSTS);
    const writer = pick(WRITERS);
    const bad = random() < 0.22 ? pick(BAD_BODIES) : null;
    const roll = random();
    const status: PortalCommentStatus = bad
      ? (roll < 0.45 ? 'held' : roll < 0.9 ? 'rejected' : 'deleted')
      : (roll < 0.1 ? 'held' : roll < 0.95 ? 'published' : 'deleted');
    const createdAt = new Date(now - Math.round((index * 7.3 + random() * 6) * HOUR)).toISOString();
    const hex = (n: number) => Math.floor(random() * 16 ** n).toString(16).padStart(n, '0');
    const parent = index > 4 && random() < 0.3 ? rows[Math.floor(random() * rows.length)] : null;

    rows.push({
      id: `01J9DEMO${String(index).padStart(4, '0')}${hex(6).toUpperCase()}`,
      postId: parent?.postId ?? post.postId,
      postTitle: parent?.postTitle ?? post.title,
      postSlug: parent?.postSlug ?? post.slug,
      parentId: parent?.id ?? null,
      author: writer.name,
      verified: writer.verified,
      body: bad?.body ?? pick(GOOD_BODIES),
      status,
      moderationAction: bad ? (status === 'rejected' ? 'reject' : 'hold') : status === 'held' ? 'unsure' : 'publish',
      moderationReason: bad?.reason ?? (status === 'held' ? null : 'ok'),
      moderationNote: bad?.note ?? (status === 'held' ? 'Model timed out; held by the fail-closed default.' : null),
      moderationModel: bad?.model ?? (status === 'held' ? null : 'task-guard'),
      country: writer.country,
      createdAt,
      editedAt: random() < 0.06 ? createdAt : null,
      actor: demoActor({
        authAtWrite: writer.verified ? 'verified' : 'anonymous',
        readerId: writer.verified ? `reader-${hex(6)}` : null,
        ip: `203.0.${Math.floor(random() * 255)}.${Math.floor(random() * 255)}`,
        country: writer.country,
        city: writer.city,
        asn: writer.asn,
        asOrg: writer.asOrg,
        sessionNew: !writer.verified && random() < 0.4,
        botHints: bad ? Math.floor(random() * 4) : 0,
        behaviour: {
          dwellMs: bad ? Math.round(random() * 4_000) : Math.round(20_000 + random() * 300_000),
          turnstileAgeMs: Math.round(300 + random() * 3_000),
          linkCount: bad?.body.includes('http') ? 1 : 0,
          emailMx: writer.verified ? true : null,
          emailGravatar: writer.verified ? random() < 0.5 : null,
        },
        keys: {
          session: hex(8), ip: hex(8), ip24: hex(8), fp: hex(8),
          email: writer.verified ? hex(8) : null,
          bodyHash: hex(8),
          linkDomains: bad?.body.includes('cheap-backlinks') ? ['cheap-backlinks.example'] : [],
        },
      }),
    });
  }
  return rows;
}

interface DemoStore {
  comments: AdminCommentRecord[];
  activity: PortalActivityEntry[];
}

function seedStore(): DemoStore {
  return {
    comments: enrichComments([...structuredClone(DEMO_COMMENTS.comments), ...generateComments()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
    activity: structuredClone(DEMO_ACTIVITY.entries),
  };
}

/* One store per dev-server process. Hot reload of this module re-seeds it,
   which is the behaviour a designer wants after editing the fixture. */
let store = seedStore();

/* `POST admin/__demo/reset` puts every demo module back to its seed, so an
   e2e spec can leave the store as it found it. The modules keyed by the
   store object (comment-admin, overview's activity seed) start over with
   the fresh one; the rest re-seed on their next request. */
function resetDemo(): void {
  store = seedStore();
  resetOverviewDemo();
  resetModerationDemo();
  resetReadersDemo();
  resetAudienceDemo();
  resetToolsDemo();
  resetMessagesDemo();
  resetCommentModesDemo();
  resetOwnerCode();
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Portal-Demo': '1',
    },
  });
}

function error(status: number, code: string, message = code): Response {
  return json({ error: code, message }, status);
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(raw);
  if (raw === null || !Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function matchesKey(comment: AdminCommentRecord, type: AdminSourceKeyType, value: string): boolean {
  const { actor } = comment;
  switch (type) {
    case 'session': return actor.keys.session === value;
    case 'ip': return actor.keys.ip === value;
    case 'ip24': return actor.keys.ip24 === value;
    case 'fp': return actor.keys.fp === value;
    case 'email': return actor.keys.email === value;
    case 'client_fp': return actor.keys.clientFp === value || actor.keys.clientFpStable === value;
    case 'client_fp_stable': return actor.keys.clientFpStable === value;
    case 'storage_id': return actor.keys.storageId === value;
    case 'email_domain': return actor.keys.emailDomain === value;
    case 'body_hash': return actor.keys.bodyHash === value;
    case 'asn': return String(actor.asn ?? '') === value;
    case 'domain': return actor.keys.linkDomains.includes(value);
    default: return false;
  }
}

function summarize(rows: AdminCommentRecord[]): PortalCommentSummary {
  const now = Date.now();
  const byStatus: Record<PortalCommentStatus, number> = { held: 0, published: 0, rejected: 0, deleted: 0 };
  const reasons = new Map<string, number>();
  const posts = new Map<string, { postId: string; count: number; title: string | null; slug: string | null }>();
  const days = new Map<string, number>();
  for (let offset = 13; offset >= 0; offset -= 1) {
    days.set(new Date(now - offset * 86_400_000).toISOString().slice(0, 10), 0);
  }
  let oldestHeldAt: string | null = null;
  let today = 0;

  for (const row of rows) {
    byStatus[row.status] += 1;
    if (now - Date.parse(row.createdAt) < 86_400_000) today += 1;
    if (row.status === 'held' && (!oldestHeldAt || row.createdAt < oldestHeldAt)) oldestHeldAt = row.createdAt;
    if (row.moderationReason && row.moderationReason !== 'ok') {
      reasons.set(row.moderationReason, (reasons.get(row.moderationReason) ?? 0) + 1);
    }
    if (row.status === 'published') {
      const entry = posts.get(row.postId) ?? { postId: row.postId, count: 0, title: row.postTitle, slug: row.postSlug };
      entry.count += 1;
      posts.set(row.postId, entry);
    }
    const day = row.createdAt.slice(0, 10);
    if (days.has(day)) days.set(day, (days.get(day) ?? 0) + 1);
  }

  return {
    byStatus,
    today,
    oldestHeldAt,
    reasons: [...reasons].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    topPosts: [...posts.values()].sort((a, b) => b.count - a.count).slice(0, 5),
    daily: [...days].map(([date, count]) => ({ date, count })),
  };
}

function listComments(params: URLSearchParams): Response {
  const status = params.get('status') ?? 'all';
  const postId = params.get('postId');
  const key = params.get('key') as AdminSourceKeyType | null;
  const value = params.get('value');
  const limit = clampInt(params.get('limit'), 25, 1, 100);
  const offset = clampInt(params.get('offset'), 0, 0, 100_000);

  // The summary counts ignore the status filter but honour the pivot, the
  // same way site-api scopes it.
  let scoped = store.comments;
  if (postId) scoped = scoped.filter((row) => row.postId === postId);
  if (key && value) scoped = scoped.filter((row) => matchesKey(row, key, value));
  const filtered = status === 'all' ? scoped : scoped.filter((row) => row.status === status);
  const page = filtered.slice(offset, offset + limit);

  return json({
    summary: summarize(scoped),
    comments: withClusters(page, store.comments),
    total: filtered.length,
    nextOffset: offset + page.length < filtered.length ? offset + page.length : null,
  });
}

function logActivity(comment: AdminCommentRecord, event: PortalActivityEntry['event']): void {
  store.activity.unshift({
    id: `ac_demo_${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    event,
    actor: 'owner',
    source: 'portal',
    targetType: 'comment',
    targetId: comment.id,
    postId: comment.postId,
    postTitle: comment.postTitle,
    postSlug: comment.postSlug,
    displayName: comment.author,
    readerId: comment.actor.readerId,
    anonymous: comment.actor.readerId === null,
    emoji: null,
    status: comment.status,
    reason: null,
    note: null,
  });
}

async function actOnComment(id: string, request: Request): Promise<Response> {
  const comment = store.comments.find((row) => row.id === id);
  if (!comment) return error(404, 'comment_not_found');
  const body = await request.json().catch(() => ({})) as { action?: string };

  if (body.action === 'approve') {
    if (comment.status === 'published') return json({ result: 'already_approved', comment: { id, status: comment.status } });
    if (comment.status !== 'held' && comment.status !== 'rejected') return error(409, 'comment_not_actionable');
    comment.status = 'published';
    comment.moderationReason = 'ok';
    comment.moderationModel = null;
    logActivity(comment, 'comment.approve');
    return json({ result: 'approved', comment: { id, status: comment.status } });
  }
  if (body.action === 'hide') {
    if (comment.status === 'held') return json({ result: 'already_hidden', comment: { id, status: comment.status } });
    if (comment.status !== 'published') return error(409, 'comment_not_actionable');
    comment.status = 'held';
    logActivity(comment, 'comment.hide');
    return json({ result: 'hidden', comment: { id, status: comment.status } });
  }
  if (body.action === 'delete') {
    if (comment.status === 'deleted') return json({ result: 'already_deleted', comment: { id, status: comment.status } });
    comment.status = 'deleted';
    logActivity(comment, 'comment.delete');
    return json({ result: 'deleted', comment: { id, status: comment.status } });
  }
  return error(400, 'invalid_action');
}

/** Answers one demo request, or null for a path it does not know. `path` is
    relative to `/api/`, e.g. `admin/comments`. */
export async function handleDemoRequest(request: Request, path: string): Promise<Response> {
  // A test fixture, not a product route: no latency, no injected failure.
  if (path === 'admin/__demo/reset' && request.method.toUpperCase() === 'POST') {
    resetDemo();
    return json({ reset: true });
  }
  // `?demoDelay=<ms>` and `?demoFail=<path prefix>` on the portal URL; the
  // client forwards them as these headers in dev only (app/api.ts).
  const delay = clampInt(request.headers.get('x-portal-demo-delay'), LATENCY_MS, 0, 30_000);
  await new Promise((resolve) => setTimeout(resolve, delay));
  const failing = request.headers.get('x-portal-demo-fail')?.replace(/^\/+/, '');
  if (failing && (failing === '*' || path.startsWith(failing))) {
    // The shape site-api sends when a handler throws, so the UI is tested
    // against the real thing. `*` fails every path.
    return json({ error: 'Internal Server Error' }, 500);
  }
  const params = new URL(request.url).searchParams;
  const method = request.method.toUpperCase();
  const segments = path.split('/').filter(Boolean).map(decodeURIComponent);

  // Home, activity, audit, the notify gate and analytics live in their own module.
  const overview = await handleOverviewDemo(request, segments, store);
  if (overview) return overview;

  if (segments[0] !== 'admin') return error(404, 'not_found');
  const [, resource, ...rest] = segments;

  // Reactions, bans and insights live in their own module.
  const moderation = await handleModerationDemo(request, segments.slice(1), params, store.comments);
  if (moderation) return moderation;

  // Subscribers and broadcasts live in their own module.
  const audience = await handleAudienceDemo(request, segments.slice(1), params);
  if (audience) return audience;

  // Mood operations and the AI model test live in their own module.
  const tools = await handleToolsDemo(request, segments.slice(1), params);
  if (tools) return tools;

  // The comment queue, the owner's acts, replies, the lockdown and source
  // profiles live in their own module.
  const commentAdmin = await handleCommentAdminDemo(request, segments.slice(1), store);
  if (commentAdmin) return commentAdmin;

  // P6: the owner's pin and lock, per-post modes, messages, revoked readers.
  const p6 =
    (await handleCommentControlsDemo(request, segments.slice(1), store)) ??
    (await handleCommentModesDemo(request, segments.slice(1), store.comments)) ??
    (await handleMessagesDemo(request, segments.slice(1))) ??
    (await handleReadersDemo(request, segments.slice(1)));
  if (p6) return p6;

  if (resource === 'session' && method === 'GET') return json({ login: 'admin', avatarUrl: null });

  if (resource === 'comments') {
    if (rest.length === 0 && method === 'GET') return listComments(params);
    if (rest[0] === 'owner-code' && method === 'POST') return ownerCode(request, json);
    if (rest.length === 1 && method === 'POST') return actOnComment(rest[0], request);
  }

  if (resource === 'sources' && rest.length === 2) {
    const [type, value] = rest as [AdminSourceKeyType, string];
    return json(sourceProfile(type, value, store.comments.filter((row) => matchesKey(row, type, value))));
  }

  return error(404, 'demo_not_implemented', `The demo API does not answer ${method} ${path} yet.`);
}
