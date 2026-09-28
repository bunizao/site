/* Demo answers for the comment queue and the owner's acts on it: the list
   with its filters, search, sort and window; approve, hide, reject, delete
   and restore, one row or twenty at once; the owner's reply; the site-wide
   lockdown; and the source profile a pivot reads.

   Same paths, validation, error codes and state machine as site-api
   (src/pages/admin/comments/* and comments/server/owner-moderation.ts
   there), so the portal meets the real edge cases -- a stale selection, a
   row with nothing to restore, a one-character search -- in dev first.
   What the demo does not do is the follow-up after a move (Akismet
   feedback, the Telegram bridge, reply mail): none of it is visible here.

   Dispatched from demo-api.ts, which owns the store. Per-store state (what
   a delete replaced, the lockdown) lives beside the store, so a unit test
   that builds its own store starts clean. Only imported behind
   `import.meta.env.DEV`. */

import {
  ADMIN_COMMENT_REJECT_REASONS,
  type AdminCommentAction,
  type AdminCommentActionResult,
  type AdminCommentLockdown,
  type AdminCommentModelFilter,
  type AdminCommentQueueSort,
  type AdminCommentQueueWindow,
  type AdminCommentRecord,
  type AdminCommentRejectReason,
  type AdminCommentStatus,
  type AdminCommentSummary,
  type AdminSourceKeyType,
  type CommentSurface,
} from '@bunizao/contracts';
import type { PortalActivityEntry, PortalActivityEvent } from '@/features/admin/server/portal-client';
import { sourceProfile, withClusters } from './comments';

export interface CommentAdminStore {
  comments: AdminCommentRecord[];
  activity: PortalActivityEntry[];
}

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/* site-api's limits, by the names it uses. */
export const MAX_OWNER_ACTION_IDS = 20;
export const RESTORE_WINDOW_DAYS = 30;
const SEARCH_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 90;
const QUERY_MIN_LENGTH = 2;
const QUERY_MAX_LENGTH = 100;
const REPLY_MAX_LENGTH = 2000;
const LOCKDOWN_MAX_MINUTES = 7 * 24 * 60;
const NOTE_MAX_LENGTH = 200;
const MAX_ID_LENGTH = 64;

const OWNER_NAME = 'bunizao';

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

async function readBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Per-store state                                                     */
/* ------------------------------------------------------------------ */

interface Remembered {
  status: AdminCommentStatus;
  note: string | null;
}

interface DemoState {
  /** What an owner delete replaced, by comment id: `pre_delete_status`
      and `pre_delete_note` in site-api. */
  replaced: Map<string, Remembered>;
  lockdown: AdminCommentLockdown | null;
}

const states = new WeakMap<CommentAdminStore, DemoState>();

/** site-api's publicPostPath; null when there is no key to link by. */
function postPathOf(surface: CommentSurface, key: string | null): string | null {
  if (!key) return null;
  return surface === 'mood' ? `/mood/${encodeURIComponent(key)}` : `/blog/${encodeURIComponent(key)}`;
}

/* The seed predates these routes, so the first request fills what site-api
   always sends: the surface, the verdict and update stamps, the restore
   window. Model names become site-api's (`akismet`, or `akismet+<model>`
   when the gateway model ruled too). On generated rows, two step-up holds
   give the risk sort a score to order by, deleted rows get a window, and
   three mood comments give the surface filter something to find. */
function stateOf(store: CommentAdminStore): DemoState {
  let state = states.get(store);
  if (state) return state;
  state = { replaced: new Map(), lockdown: null };
  states.set(store, state);

  let awaiting = 0;
  for (const row of store.comments) {
    row.surface ??= /^\d+$/.test(row.postId) ? 'mood' : 'blog';
    row.postPath ??= postPathOf(row.surface, row.surface === 'mood' ? row.postId : row.postSlug);
    row.byAuthor ??= false;
    if (row.moderationModel && row.moderationModel !== 'akismet' && !row.moderationModel.startsWith('akismet+')) {
      row.moderationModel = `akismet+${row.moderationModel}`;
    }
    const written = row.editedAt ?? row.createdAt;
    row.updatedAt ??= written;
    if (row.moderatedAt === undefined) {
      row.moderatedAt = row.moderationAction ? new Date(Date.parse(row.createdAt) + 2_000).toISOString() : null;
    }
    // The rest shapes generated rows only; fixture rows keep what they say.
    const generated = row.id.startsWith('01J9DEMO');
    if (generated && row.status === 'held' && !row.moderationModel && !row.verified && awaiting < 2) {
      row.moderationNote = `Awaiting email: score ${awaiting === 0 ? 7 : 4} (new session, pasted body)`;
      awaiting += 1;
    }
    if (generated && row.status === 'deleted' && row.restorableUntil === undefined) {
      // The farm's rows went in a ban purge, which restore cannot undo;
      // every other deleted row was an owner delete two hours after it
      // was written.
      if (row.moderationReason === 'spam' || row.moderationReason === 'promotional') {
        row.restorableUntil = null;
      } else {
        const deletedAt = Date.parse(row.createdAt) + 2 * HOUR;
        state.replaced.set(row.id, { status: row.moderationReason === 'ok' ? 'published' : 'rejected', note: row.moderationNote });
        row.moderationNote = 'Deleted by the owner from the admin portal.';
        row.restorableUntil = new Date(deletedAt + RESTORE_WINDOW_DAYS * DAY).toISOString();
        row.updatedAt = new Date(deletedAt).toISOString();
      }
    }
    row.restorableUntil ??= null;
    row.pinnedAt ??= null;
    row.lockedAt ??= null;
  }

  // The newest generated root with a published reply is its post's pin;
  // the next one, on another post, has its replies locked.
  const answered = store.comments.filter((row) =>
    row.id.startsWith('01J9DEMO') && row.parentId === null && row.status === 'published'
    && store.comments.some((reply) => reply.parentId === row.id && reply.status === 'published'));
  const pinned = answered[0];
  const locked = answered.find((row) => row.postId !== pinned?.postId);
  if (pinned) pinned.pinnedAt = new Date(Date.parse(pinned.createdAt) + 3 * HOUR).toISOString();
  if (locked) locked.lockedAt = new Date(Date.parse(locked.createdAt) + 5 * HOUR).toISOString();

  const base = store.comments.find((row) => row.verified && row.status === 'published' && row.id.startsWith('01J9DEMO'));
  if (base) {
    const MOOD = [
      { postId: '2841', title: '今天把阳台的花都换了盆', body: '换完盆记得少浇两天水，根会自己找路。' },
      { postId: '2841', title: '今天把阳台的花都换了盆', body: 'Which soil mix did you end up using?' },
      { postId: '2836', title: 'Late train, good book', body: 'What was the book? Asking for my own late trains.' },
    ];
    MOOD.forEach((mood, index) => {
      const createdAt = new Date(Date.now() - (5 + index * 19) * HOUR).toISOString();
      store.comments.push({
        ...structuredClone(base),
        id: `01J9MOOD${String(index).padStart(4, '0')}A0B1C2`,
        surface: 'mood',
        postId: mood.postId,
        postTitle: mood.title,
        postSlug: null,
        postPath: postPathOf('mood', mood.postId),
        parentId: null,
        body: mood.body,
        createdAt,
        editedAt: null,
        updatedAt: createdAt,
        moderatedAt: createdAt,
        restorableUntil: null,
        pinnedAt: null,
        lockedAt: null,
      });
    });
    store.comments.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  return state;
}

/* ------------------------------------------------------------------ */
/* The queue                                                           */
/* ------------------------------------------------------------------ */

const STATUSES: readonly AdminCommentStatus[] = ['held', 'published', 'rejected', 'deleted'];
const SORTS: readonly AdminCommentQueueSort[] = ['newest', 'oldest', 'risk'];
const MODELS: readonly AdminCommentModelFilter[] = ['akismet', 'llm', 'none'];
const REASONS: readonly string[] = ['ok', ...ADMIN_COMMENT_REJECT_REASONS];
const SURFACES: readonly string[] = ['blog', 'mood'];
const KEY_TYPES: readonly string[] = [
  'session', 'ip', 'ip24', 'fp', 'email', 'client_fp', 'client_fp_stable', 'storage_id', 'email_domain', 'body_hash', 'asn', 'domain',
];

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

export function matchesKey(comment: AdminCommentRecord, type: AdminSourceKeyType, value: string): boolean {
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

class QueueInputError extends Error {
  constructor(readonly code: 'invalid_date' | 'invalid_query') {
    super(code);
  }
}

/** `YYYY-MM-DD` or a full ISO instant, as a canonical ISO string. */
function parseInstant(value: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z)?$/.test(value)) return undefined;
  const time = Date.parse(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
}

/** site-api's resolveQueueWindow: search and the risk sort always read a
    window, 30 days unless named and never more than 90; a wider one is
    clamped, not refused. */
function resolveWindow(
  input: { from?: string; to?: string; q?: string; sort: AdminCommentQueueSort },
  now: number,
): AdminCommentQueueWindow | null {
  const q = input.q?.trim() ?? '';
  if (input.q !== undefined && (q.length < QUERY_MIN_LENGTH || q.length > QUERY_MAX_LENGTH)) {
    throw new QueueInputError('invalid_query');
  }
  const from = input.from ? parseInstant(input.from) : null;
  const to = input.to ? parseInstant(input.to) : null;
  if (from === undefined || to === undefined) throw new QueueInputError('invalid_date');
  if (from && to && from >= to) throw new QueueInputError('invalid_date');
  if (!q && input.sort !== 'risk') return from || to ? { from, to } : null;

  const end = to ? Date.parse(to) : now;
  const start = from ?? new Date(end - SEARCH_WINDOW_DAYS * DAY).toISOString();
  // Wider than 90 days: cut to the 90 before its end, and say so.
  if (end - Date.parse(start) > MAX_WINDOW_DAYS * DAY) {
    return { from: new Date(end - MAX_WINDOW_DAYS * DAY).toISOString(), to, clamped: true };
  }
  return { from: start, to };
}

const AWAITING_SCORE = /^Awaiting email: score (\d+)/;

function riskOf(row: AdminCommentRecord): [number, number, number] {
  const flagged = row.moderationReason && row.moderationReason !== 'ok' ? 1 : 0;
  const score = Number(AWAITING_SCORE.exec(row.moderationNote ?? '')?.[1] ?? 0);
  return [flagged, score, row.actor.botHints];
}

const ORDER: Record<AdminCommentQueueSort, (a: AdminCommentRecord, b: AdminCommentRecord) => number> = {
  newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
  oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
  risk: (a, b) => {
    const [ra, rb] = [riskOf(a), riskOf(b)];
    return rb[0] - ra[0] || rb[1] - ra[1] || rb[2] - ra[2] || b.createdAt.localeCompare(a.createdAt);
  },
};

/** The numbers above the queue: global, never scoped by the filters. */
function summarize(rows: readonly AdminCommentRecord[], now: number): AdminCommentSummary {
  const byStatus: Record<AdminCommentStatus, number> = { held: 0, published: 0, rejected: 0, deleted: 0 };
  const reasons = new Map<string, number>();
  const posts = new Map<string, AdminCommentSummary['topPosts'][number]>();
  const days = new Map<string, number>();
  for (let offset = 13; offset >= 0; offset -= 1) days.set(new Date(now - offset * DAY).toISOString().slice(0, 10), 0);
  let oldestHeldAt: string | null = null;
  let today = 0;

  for (const row of rows) {
    byStatus[row.status] += 1;
    if (now - Date.parse(row.createdAt) < DAY) today += 1;
    if (row.status === 'held' && (!oldestHeldAt || row.createdAt < oldestHeldAt)) oldestHeldAt = row.createdAt;
    if (row.moderationReason && row.moderationReason !== 'ok') {
      reasons.set(row.moderationReason, (reasons.get(row.moderationReason) ?? 0) + 1);
    }
    if (row.status === 'published') {
      const surface = row.surface ?? 'blog';
      const key = `${surface}:${row.postId}`;
      const entry = posts.get(key) ?? {
        surface, postId: row.postId, count: 0, title: row.postTitle, slug: row.postSlug, path: row.postPath ?? null,
      };
      entry.count += 1;
      posts.set(key, entry);
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

function listQueue(store: CommentAdminStore, params: URLSearchParams): Response {
  const param = (name: string) => params.get(name) || undefined;
  const status = param('status') ?? 'all';
  if (status !== 'all' && !isOneOf(STATUSES, status)) return fail(400, 'invalid_status');
  const key = param('key');
  if (key && !KEY_TYPES.includes(key)) return fail(400, 'invalid_key');
  const surface = param('surface');
  if (surface && !SURFACES.includes(surface)) return fail(400, 'invalid_surface');
  const reason = param('reason');
  if (reason && !REASONS.includes(reason)) return fail(400, 'invalid_reason');
  const model = param('model');
  if (model && !isOneOf(MODELS, model)) return fail(400, 'invalid_model');
  const sortParam = param('sort');
  if (sortParam && !isOneOf(SORTS, sortParam)) return fail(400, 'invalid_sort');
  const sort: AdminCommentQueueSort = isOneOf(SORTS, sortParam) ? sortParam : 'newest';

  const now = Date.now();
  let window: AdminCommentQueueWindow | null;
  try {
    window = resolveWindow({ from: param('from'), to: param('to'), q: param('q'), sort }, now);
  } catch (error) {
    if (error instanceof QueueInputError) return fail(400, error.code);
    throw error;
  }

  const q = param('q')?.trim().toLowerCase() ?? '';
  const postId = param('postId');
  const value = param('value');
  const rows = store.comments.filter((row) =>
    (status === 'all' || row.status === status)
    && (!window?.from || row.createdAt >= window.from)
    && (!window?.to || row.createdAt < window.to)
    && (!postId || row.postId === postId)
    && (!surface || row.surface === surface)
    && (!reason || row.moderationReason === reason)
    && (model !== 'akismet' || row.moderationModel === 'akismet')
    && (model !== 'llm' || Boolean(row.moderationModel?.startsWith('akismet+')))
    && (model !== 'none' || row.moderationModel === null)
    && (!q || row.body.toLowerCase().includes(q) || row.author.toLowerCase().includes(q))
    && (!key || !value || matchesKey(row, key as AdminSourceKeyType, value)));
  rows.sort(ORDER[sort]);

  const limit = clampInt(params.get('limit'), 25, 1, 100);
  const offset = clampInt(params.get('offset'), 0, 0, 1_000_000);
  const page = rows.slice(offset, offset + limit);
  return json({
    summary: summarize(store.comments, now),
    comments: withClusters(page, store.comments),
    total: rows.length,
    nextOffset: offset + page.length < rows.length ? offset + page.length : null,
    window,
  });
}

/* ------------------------------------------------------------------ */
/* The owner's acts                                                    */
/* ------------------------------------------------------------------ */

const ACTIONS: readonly AdminCommentAction[] = ['approve', 'hide', 'reject', 'delete', 'restore'];

const MOVES_FROM: Record<AdminCommentAction, readonly AdminCommentStatus[]> = {
  approve: ['held', 'rejected'],
  hide: ['published'],
  reject: ['held', 'published'],
  delete: ['published', 'held', 'rejected'],
  restore: ['deleted'],
};

const ALREADY: Record<AdminCommentAction, { status: AdminCommentStatus; result: AdminCommentActionResult } | null> = {
  approve: { status: 'published', result: 'already_approved' },
  hide: { status: 'held', result: 'already_hidden' },
  reject: { status: 'rejected', result: 'already_rejected' },
  delete: { status: 'deleted', result: 'already_deleted' },
  restore: null,
};

const APPLIED: Record<AdminCommentAction, AdminCommentActionResult> = {
  approve: 'approved',
  hide: 'hidden',
  reject: 'rejected',
  delete: 'deleted',
  restore: 'restored',
};

/* Reject and restore log as `comment.moderate`, as site-api's log table
   has no event of their own. */
const LOG_EVENT: Record<AdminCommentAction, PortalActivityEvent> = {
  approve: 'comment.approve',
  hide: 'comment.hide',
  reject: 'comment.moderate',
  delete: 'comment.delete',
  restore: 'comment.moderate',
};

const NOTE_VERB: Record<AdminCommentAction, string> = {
  approve: 'Approved',
  hide: 'Hidden',
  reject: 'Rejected',
  delete: 'Deleted',
  restore: 'Restored',
};

function isRejectReason(value: unknown): value is AdminCommentRejectReason {
  return isOneOf(ADMIN_COMMENT_REJECT_REASONS, value);
}

type Outcome = { id: string; result: AdminCommentActionResult; row: AdminCommentRecord | null };

/** One act on one row: site-api's decide, then the guarded UPDATE. */
function applyOne(
  store: CommentAdminStore,
  state: DemoState,
  id: string,
  action: AdminCommentAction,
  reason: AdminCommentRejectReason | undefined,
  now: Date,
): Outcome {
  const row = store.comments.find((comment) => comment.id === id);
  if (!row) return { id, result: 'not_available', row: null };
  const already = ALREADY[action];
  if (already && row.status === already.status) return { id, result: already.result, row };
  // A row the act cannot leave still says where it stands, as in site-api.
  if (!MOVES_FROM[action].includes(row.status)) return { id, result: 'not_available', row };
  const remembered = state.replaced.get(id);
  if (action === 'restore' && (!remembered || !row.restorableUntil || Date.parse(row.restorableUntil) <= now.getTime())) {
    return { id, result: 'not_restorable', row };
  }

  const stamp = now.toISOString();
  const note = `${NOTE_VERB[action]} by the owner from the admin portal.`;
  switch (action) {
    case 'approve':
    case 'hide':
      row.status = action === 'approve' ? 'published' : 'held';
      row.moderationAction = action === 'approve' ? 'publish' : 'hold';
      row.moderationReason = 'ok';
      row.moderationNote = note;
      row.moderationModel = null;
      row.moderatedAt = stamp;
      break;
    case 'reject':
      // The model stays, as in site-api: a later approve takes its report back.
      row.status = 'rejected';
      row.moderationAction = 'reject';
      row.moderationReason = reason ?? null;
      row.moderationNote = note;
      row.moderatedAt = stamp;
      break;
    case 'delete':
      state.replaced.set(id, { status: row.status, note: row.moderationNote });
      row.status = 'deleted';
      row.moderationNote = note;
      row.restorableUntil = new Date(now.getTime() + RESTORE_WINDOW_DAYS * DAY).toISOString();
      break;
    case 'restore':
      row.status = remembered!.status;
      row.moderationNote = remembered!.note;
      row.restorableUntil = null;
      state.replaced.delete(id);
      break;
  }
  row.updatedAt = stamp;
  logActivity(store, row, LOG_EVENT[action], note, stamp);
  return { id, result: APPLIED[action], row };
}

function logActivity(store: CommentAdminStore, row: AdminCommentRecord, event: PortalActivityEvent, note: string, stamp: string): void {
  store.activity.unshift({
    id: `ac_demo_${crypto.randomUUID().slice(0, 8)}`,
    createdAt: stamp,
    event,
    actor: 'owner',
    source: 'portal',
    targetType: 'comment',
    targetId: row.id,
    postId: row.postId,
    postTitle: row.postTitle,
    postSlug: row.postSlug,
    displayName: row.author,
    readerId: row.actor.readerId,
    anonymous: row.actor.readerId === null,
    emoji: null,
    status: row.status,
    reason: row.moderationReason,
    note,
  });
}

async function actOnOne(store: CommentAdminStore, state: DemoState, id: string, request: Request): Promise<Response> {
  const body = await readBody<{ action?: unknown; reason?: unknown }>(request);
  if (!body) return fail(400, 'invalid_json');
  if (!isOneOf(ACTIONS, body.action)) return fail(400, 'invalid_action');
  if (body.action === 'reject' && !isRejectReason(body.reason)) return fail(400, 'invalid_reason');

  const outcome = applyOne(store, state, id, body.action, isRejectReason(body.reason) ? body.reason : undefined, new Date());
  if (outcome.result === 'not_available') return fail(409, 'comment_not_actionable');
  if (outcome.result === 'not_restorable') return fail(409, 'comment_not_restorable');
  return json({ result: outcome.result, comment: { id, status: outcome.row!.status } });
}

/* All or nothing, as site-api's one D1 batch: the demo applies every id in
   one synchronous pass, which nothing can interleave with. */
async function actOnMany(store: CommentAdminStore, state: DemoState, request: Request): Promise<Response> {
  const body = await readBody<{ ids?: unknown; action?: unknown; reason?: unknown }>(request);
  if (!body) return fail(400, 'invalid_json');
  if (!isOneOf(ACTIONS, body.action)) return fail(400, 'invalid_action');
  if (body.action === 'reject' && !isRejectReason(body.reason)) return fail(400, 'invalid_reason');
  const raw = body.ids;
  if (!Array.isArray(raw) || raw.length === 0) return fail(400, 'invalid_ids');
  const ids = raw.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= MAX_ID_LENGTH);
  if (ids.length !== raw.length) return fail(400, 'invalid_ids');
  const unique = [...new Set(ids)];
  if (unique.length > MAX_OWNER_ACTION_IDS) return fail(400, 'too_many_ids');

  const now = new Date();
  const reason = isRejectReason(body.reason) ? body.reason : undefined;
  const results = unique.map((id) => {
    const outcome = applyOne(store, state, id, body.action as AdminCommentAction, reason, now);
    // The row's status after the call whatever the result; null only for
    // an id with no row.
    return { id, result: outcome.result, status: outcome.row?.status ?? null };
  });
  return json({ results });
}

/* ------------------------------------------------------------------ */
/* The owner's reply                                                   */
/* ------------------------------------------------------------------ */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const OWNER_SESSION = 'portal-owner';

/* Idempotent on `replyId` as in site-api (owner-reply.ts there): the id
   becomes the row's, so a retry finds the first reply and answers it again
   before anything else is checked, even when the comment answered has
   been taken down since. The same id on another thread or another body is
   a collision. Without one, every call writes a new reply. */
async function reply(store: CommentAdminStore, id: string, request: Request): Promise<Response> {
  const body = await readBody<{ body?: unknown; replyId?: unknown }>(request);
  if (!body) return fail(400, 'invalid_json');
  if (typeof body.body !== 'string') return fail(400, 'invalid_body');
  if (body.replyId !== undefined && (typeof body.replyId !== 'string' || !UUID.test(body.replyId))) {
    return fail(400, 'invalid_reply_id');
  }
  const text = body.body.trim();
  if (text.length < 1 || text.length > REPLY_MAX_LENGTH) return fail(400, 'invalid_body');

  const replyId = typeof body.replyId === 'string' ? body.replyId.toLowerCase() : null;
  const target = store.comments.find((row) => row.id === id);
  const existing = replyId ? store.comments.find((row) => row.id === replyId) : undefined;
  if (existing) {
    const same = target !== undefined
      && existing.actor.keys.session === OWNER_SESSION
      && existing.parentId === (target.parentId ?? target.id)
      && existing.body === text;
    if (!same) return fail(409, 'reply_id_collision');
    return json({ comment: { id: existing.id, parentId: existing.parentId, status: existing.status } });
  }
  if (!target || target.status !== 'published') return fail(409, 'target_unavailable');

  const stamp = new Date().toISOString();
  const record: AdminCommentRecord = {
    ...structuredClone(target),
    id: replyId ?? `01J9REPLY${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`,
    parentId: target.parentId ?? target.id,
    author: OWNER_NAME,
    verified: true,
    byAuthor: true,
    body: text,
    status: 'published',
    moderationAction: 'publish',
    moderationReason: 'ok',
    moderationNote: 'Published by the owner from the admin portal.',
    moderationModel: null,
    moderatedAt: stamp,
    country: null,
    createdAt: stamp,
    editedAt: null,
    updatedAt: stamp,
    restorableUntil: null,
    pinnedAt: null,
    lockedAt: null,
  };
  record.actor = {
    ...record.actor,
    readerId: 'reader-owner',
    authAtWrite: 'verified',
    email: null,
    ip: null,
    ua: 'Admin portal',
    browser: null,
    os: null,
    country: null,
    city: null,
    asn: null,
    asOrg: null,
    sessionNew: false,
    botHints: 0,
    detail: null,
    client: null,
    keys: {
      ...record.actor.keys,
      session: OWNER_SESSION,
      ip: null,
      ip24: null,
      fp: null,
      clientFp: null,
      clientFpStable: null,
      storageId: null,
      bodyHash: null,
      linkDomains: [],
    },
  };
  store.comments.unshift(record);
  store.activity.unshift({
    id: `ac_demo_${crypto.randomUUID().slice(0, 8)}`,
    createdAt: stamp,
    event: 'comment.create',
    actor: 'owner',
    source: 'portal',
    targetType: 'comment',
    targetId: record.id,
    postId: record.postId,
    postTitle: record.postTitle,
    postSlug: record.postSlug,
    displayName: OWNER_NAME,
    readerId: 'reader-owner',
    anonymous: false,
    emoji: null,
    status: 'published',
    reason: 'ok',
    note: record.moderationNote,
  });
  return json({ comment: { id: record.id, parentId: record.parentId, status: record.status } });
}

/* ------------------------------------------------------------------ */
/* The lockdown                                                        */
/* ------------------------------------------------------------------ */

function currentLockdown(state: DemoState, now = Date.now()): AdminCommentLockdown | null {
  if (state.lockdown && Date.parse(state.lockdown.until) <= now) state.lockdown = null;
  return state.lockdown;
}

async function lockdown(state: DemoState, request: Request, method: string): Promise<Response | null> {
  if (method === 'GET') return json({ lockdown: currentLockdown(state) });
  if (method === 'DELETE') {
    state.lockdown = null;
    return json({ lockdown: null });
  }
  if (method !== 'POST') return null;
  const body = await readBody<{ minutes?: unknown; note?: unknown }>(request);
  if (!body) return fail(400, 'invalid_json');
  const { minutes, note } = body;
  if (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < 1 || minutes > LOCKDOWN_MAX_MINUTES) {
    return fail(400, 'invalid_minutes');
  }
  if (note !== undefined && (typeof note !== 'string' || note.trim().length > NOTE_MAX_LENGTH)) {
    return fail(400, 'invalid_note');
  }
  const now = Date.now();
  state.lockdown = {
    reason: (typeof note === 'string' && note.trim()) || 'engaged by the owner',
    since: new Date(now).toISOString(),
    until: new Date(now + minutes * MINUTE).toISOString(),
    by: 'owner',
  };
  return json({ lockdown: state.lockdown });
}

/** The detector's lockdown, for tests and for a designer who wants to see
    one: an hour, `by: 'auto'`, unless one is already running. */
export function engageAutoLockdown(store: CommentAdminStore, reason: string, now = Date.now()): AdminCommentLockdown | null {
  const state = stateOf(store);
  if (currentLockdown(state, now)) return null;
  state.lockdown = { reason, since: new Date(now).toISOString(), until: new Date(now + HOUR).toISOString(), by: 'auto' };
  return state.lockdown;
}

/* ------------------------------------------------------------------ */
/* Dispatch                                                            */
/* ------------------------------------------------------------------ */

/** Answers `admin/comments[/…]` and `admin/sources/:type/:value`, or null
    for a path this module does not own. `segments` starts after `admin`. */
export async function handleCommentAdminDemo(
  request: Request,
  segments: string[],
  store: CommentAdminStore,
): Promise<Response | null> {
  const [resource, ...rest] = segments;
  if (resource !== 'comments' && resource !== 'sources') return null;
  const state = stateOf(store);
  const method = request.method.toUpperCase();

  if (resource === 'sources') {
    if (rest.length !== 2 || method !== 'GET') return null;
    const [type, value] = rest as [AdminSourceKeyType, string];
    return json(sourceProfile(type, value, store.comments.filter((row) => matchesKey(row, type, value))));
  }

  if (rest.length === 0) return method === 'GET' ? listQueue(store, new URL(request.url).searchParams) : null;
  if (rest.length === 1 && rest[0] === 'lockdown') return lockdown(state, request, method);
  if (rest.length === 1 && rest[0] === 'bulk') return method === 'POST' ? actOnMany(store, state, request) : null;
  if (rest.length === 1 && (rest[0] === 'owner-code' || rest[0] === 'insights')) return null;
  if (rest.length === 1 && method === 'POST') return actOnOne(store, state, rest[0], request);
  if (rest.length === 2 && rest[1] === 'reply' && method === 'POST') return reply(store, rest[0], request);
  return null;
}
