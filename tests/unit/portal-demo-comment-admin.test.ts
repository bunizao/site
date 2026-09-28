import { describe, expect, test } from 'bun:test';
import type { AdminCommentRecord, AdminCommentStatus } from '@bunizao/contracts';
import { demoActor } from '../../src/features/admin/server/portal-demo';
import {
  engageAutoLockdown,
  handleCommentAdminDemo,
  type CommentAdminStore,
} from '../../src/features/portal/server/demo/comment-admin';

/* The demo's comment routes against site-api's state machine
   (owner-moderation.ts there). Every test builds its own store, and the
   demo keeps its per-store state beside it, so nothing leaks between them. */

const HOUR = 3_600_000;

function row(id: string, status: AdminCommentStatus, extra: Partial<AdminCommentRecord> = {}): AdminCommentRecord {
  return {
    id,
    postId: '665f0a11',
    postTitle: 'The retry budget nobody wrote down',
    postSlug: 'retry-budget',
    parentId: null,
    author: `writer-${id}`,
    verified: false,
    body: `Body of ${id}`,
    status,
    moderationAction: status === 'rejected' ? 'reject' : status === 'held' ? 'hold' : 'publish',
    moderationReason: status === 'rejected' ? 'spam' : 'ok',
    moderationNote: null,
    moderationModel: status === 'rejected' ? 'akismet' : null,
    country: 'AU',
    createdAt: new Date(Date.now() - HOUR).toISOString(),
    editedAt: null,
    actor: demoActor(),
    ...extra,
  };
}

function storeOf(...comments: AdminCommentRecord[]): CommentAdminStore {
  return { comments, activity: [] };
}

function request(method: string, path: string, body?: unknown): [Request, string[]] {
  const url = new URL(`http://localhost/dev/portal/api/admin/${path}`);
  const segments = url.pathname.split('/').slice(5).filter(Boolean);
  return [
    new Request(url, { method, body: body === undefined ? undefined : JSON.stringify(body) }),
    segments,
  ];
}

async function call(store: CommentAdminStore, method: string, path: string, body?: unknown) {
  const [req, segments] = request(method, path, body);
  const response = await handleCommentAdminDemo(req, segments, store);
  if (!response) throw new Error(`no demo answer for ${method} ${path}`);
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

const act = (store: CommentAdminStore, id: string, action: string, reason?: string) =>
  call(store, 'POST', `comments/${id}`, reason ? { action, reason } : { action });

describe('portal demo: one act', () => {
  test('approve, hide and reject move rows along the state machine', async () => {
    const store = storeOf(row('a', 'held'), row('b', 'published'), row('c', 'rejected'));
    expect((await act(store, 'a', 'approve')).body).toEqual({ result: 'approved', comment: { id: 'a', status: 'published' } });
    expect((await act(store, 'b', 'hide')).body.result).toBe('hidden');
    expect((await act(store, 'c', 'approve')).body.result).toBe('approved');
    expect(store.comments.map((comment) => comment.status)).toEqual(['published', 'held', 'published']);
    // Approve clears the model's verdict, like site-api.
    expect(store.comments[2].moderationModel).toBeNull();
  });

  test('a repeat is already_*, a wrong state is 409 comment_not_actionable', async () => {
    const store = storeOf(row('a', 'published'), row('b', 'rejected'));
    expect((await act(store, 'a', 'approve')).body.result).toBe('already_approved');
    expect((await act(store, 'b', 'reject', 'spam')).body.result).toBe('already_rejected');
    const wrong = await act(store, 'b', 'hide');
    expect(wrong.status).toBe(409);
    expect(wrong.body.error).toBe('comment_not_actionable');
    expect((await act(store, 'missing', 'approve')).status).toBe(409);
  });

  test('reject needs one of the five reasons and keeps the model', async () => {
    const store = storeOf(row('a', 'published', { moderationModel: 'akismet+task-guard' }));
    expect((await act(store, 'a', 'reject')).body.error).toBe('invalid_reason');
    expect((await act(store, 'a', 'reject', 'ok')).body.error).toBe('invalid_reason');
    expect((await act(store, 'a', 'reject', 'off_topic')).body.result).toBe('rejected');
    expect(store.comments[0]).toMatchObject({ status: 'rejected', moderationReason: 'off_topic', moderationModel: 'akismet+task-guard' });
    expect((await act(store, 'a', 'frobnicate')).body.error).toBe('invalid_action');
  });

  test('delete remembers what it replaced and restore puts it back, note included', async () => {
    const store = storeOf(row('a', 'held', { moderationNote: 'Awaiting email: score 5 (new session)' }));
    expect((await act(store, 'a', 'delete')).body.result).toBe('deleted');
    const deleted = store.comments[0];
    expect(deleted.status).toBe('deleted');
    expect(Date.parse(deleted.restorableUntil!) - Date.now()).toBeGreaterThan(29 * 24 * HOUR);

    expect((await act(store, 'a', 'restore')).body).toEqual({ result: 'restored', comment: { id: 'a', status: 'held' } });
    expect(store.comments[0]).toMatchObject({ status: 'held', moderationNote: 'Awaiting email: score 5 (new session)', restorableUntil: null });
    // Restore has no already_*: a row that is not deleted cannot take it.
    expect((await act(store, 'a', 'restore')).body.error).toBe('comment_not_actionable');
  });

  test('a deleted row with nothing remembered, or past its window, is not restorable', async () => {
    const store = storeOf(row('purged', 'deleted', { moderationReason: 'spam' }), row('old', 'published'));
    const purged = await act(store, 'purged', 'restore');
    expect(purged.status).toBe(409);
    expect(purged.body.error).toBe('comment_not_restorable');

    await act(store, 'old', 'delete');
    store.comments[1].restorableUntil = new Date(Date.now() - 1).toISOString();
    expect((await act(store, 'old', 'restore')).body.error).toBe('comment_not_restorable');
  });

  test('every move is logged; reject and restore as comment.moderate', async () => {
    const store = storeOf(row('a', 'held'));
    await act(store, 'a', 'reject', 'abuse');
    await act(store, 'a', 'approve');
    await act(store, 'a', 'approve');
    expect(store.activity.map((entry) => entry.event)).toEqual(['comment.approve', 'comment.moderate']);
  });

  test('stamps updatedAt on every move and moderatedAt on verdicts only', async () => {
    const store = storeOf(row('a', 'held'));
    await call(store, 'GET', 'comments');
    const before = store.comments[0].moderatedAt;
    await act(store, 'a', 'delete');
    expect(store.comments[0].moderatedAt).toBe(before);
    expect(Date.now() - Date.parse(store.comments[0].updatedAt!)).toBeLessThan(1_000);
  });
});

describe('portal demo: bulk', () => {
  test('answers per id in the order sent, each with the row\'s status after the call', async () => {
    const store = storeOf(row('a', 'held'), row('b', 'published'), row('c', 'deleted'));
    const { status, body } = await call(store, 'POST', 'comments/bulk', { ids: ['c', 'a', 'b', 'gone', 'a'], action: 'approve' });
    expect(status).toBe(200);
    // A row the act cannot leave says where it is; only a missing id is null.
    expect(body.results).toEqual([
      { id: 'c', result: 'not_available', status: 'deleted' },
      { id: 'a', result: 'approved', status: 'published' },
      { id: 'b', result: 'already_approved', status: 'published' },
      { id: 'gone', result: 'not_available', status: null },
    ]);
  });

  test('refuses more than twenty distinct ids, and bad input, before touching a row', async () => {
    const ids = Array.from({ length: 21 }, (_, index) => `id-${index}`);
    const store = storeOf(...ids.map((id) => row(id, 'held')));
    expect((await call(store, 'POST', 'comments/bulk', { ids, action: 'approve' })).body.error).toBe('too_many_ids');
    expect(store.comments.every((comment) => comment.status === 'held')).toBe(true);
    // Twenty distinct ids with a repeat are still twenty.
    const twenty = [...ids.slice(0, 20), ids[0]];
    expect((await call(store, 'POST', 'comments/bulk', { ids: twenty, action: 'approve' })).body.results).toHaveLength(20);

    expect((await call(store, 'POST', 'comments/bulk', { ids: [], action: 'approve' })).body.error).toBe('invalid_ids');
    expect((await call(store, 'POST', 'comments/bulk', { ids: [1], action: 'approve' })).body.error).toBe('invalid_ids');
    expect((await call(store, 'POST', 'comments/bulk', { ids: ['id-20'], action: 'reject' })).body.error).toBe('invalid_reason');
  });

  test('bulk restore reports rows without a window as not_restorable', async () => {
    const store = storeOf(row('a', 'published'), row('purged', 'deleted'));
    await act(store, 'a', 'delete');
    const { body } = await call(store, 'POST', 'comments/bulk', { ids: ['a', 'purged'], action: 'restore' });
    expect(body.results).toEqual([
      { id: 'a', result: 'restored', status: 'published' },
      { id: 'purged', result: 'not_restorable', status: 'deleted' },
    ]);
  });
});

describe('portal demo: the queue', () => {
  test('filters really filter, and the summary stays global', async () => {
    const store = storeOf(
      row('a', 'held', { body: 'Retry budgets per route' }),
      row('b', 'published', { postId: '2841', moderationModel: 'akismet' }),
      row('c', 'rejected', { moderationReason: 'abuse' }),
    );
    const mood = await call(store, 'GET', 'comments?surface=mood');
    expect(mood.body.comments.map((comment: AdminCommentRecord) => comment.id)).toEqual(['b']);
    expect(mood.body.summary.byStatus).toEqual({ held: 1, published: 1, rejected: 1, deleted: 0 });
    expect((await call(store, 'GET', 'comments?reason=abuse')).body.total).toBe(1);
    expect((await call(store, 'GET', 'comments?model=akismet')).body.total).toBe(2);
    expect((await call(store, 'GET', 'comments?q=retry')).body.total).toBe(1);
  });

  test('search reads a 30-day window, refuses a short query and clamps a window over 90 days', async () => {
    const store = storeOf(
      row('recent', 'held', { body: 'needle' }),
      row('old', 'held', { body: 'needle', createdAt: new Date(Date.now() - 40 * 24 * HOUR).toISOString() }),
      row('ancient', 'held', { body: 'needle', createdAt: new Date(Date.now() - 120 * 24 * HOUR).toISOString() }),
    );
    const found = await call(store, 'GET', 'comments?q=needle');
    expect(found.body.total).toBe(1);
    expect(found.body.window.to).toBeNull();
    expect(found.body.window.clamped).toBeUndefined();
    expect((await call(store, 'GET', 'comments?q=n')).body.error).toBe('invalid_query');

    // Cut to the 90 days before its end, as site-api does, and said so.
    const wide = await call(store, 'GET', 'comments?q=needle&from=2020-01-01');
    expect(wide.status).toBe(200);
    expect(wide.body.window.clamped).toBe(true);
    expect(Math.abs(Date.parse(wide.body.window.from) - (Date.now() - 90 * 24 * HOUR))).toBeLessThan(60_000);
    expect(wide.body.comments.map((comment: AdminCommentRecord) => comment.id).sort()).toEqual(['old', 'recent']);
    const ended = await call(store, 'GET', 'comments?q=needle&from=2020-01-01&to=2026-01-01');
    expect(ended.body.window).toEqual({ from: new Date(Date.parse('2026-01-01') - 90 * 24 * HOUR).toISOString(), to: '2026-01-01T00:00:00.000Z', clamped: true });
    expect((await call(store, 'GET', 'comments?from=nope')).body.error).toBe('invalid_date');
    expect((await call(store, 'GET', 'comments')).body.window).toBeNull();
  });

  test('rows carry the post path and the owner flag site-api sends', async () => {
    const store = storeOf(
      row('blog', 'published'),
      row('mood', 'published', { postId: '2841', postSlug: null, postTitle: 'Late train' }),
      row('lost', 'published', { postSlug: null, postTitle: null }),
    );
    const { body } = await call(store, 'GET', 'comments');
    const byId = new Map(body.comments.map((comment: AdminCommentRecord) => [comment.id, comment]));
    expect(byId.get('blog')).toMatchObject({ postPath: '/blog/retry-budget', byAuthor: false });
    expect(byId.get('mood')).toMatchObject({ postPath: '/mood/2841', postSlug: null });
    expect(byId.get('lost')).toMatchObject({ postPath: null });
    expect(body.summary.topPosts.find((post: { postId: string }) => post.postId === '2841').path).toBe('/mood/2841');
  });

  test('risk puts flagged rows first, then step-up scores, then bot hints', async () => {
    const store = storeOf(
      row('plain', 'held'),
      row('score4', 'held', { moderationNote: 'Awaiting email: score 4 (x)' }),
      row('flagged', 'rejected', { moderationReason: 'spam' }),
      row('score9', 'held', { moderationNote: 'Awaiting email: score 9 (x)' }),
    );
    const { body } = await call(store, 'GET', 'comments?sort=risk');
    expect(body.comments.map((comment: AdminCommentRecord) => comment.id)).toEqual(['flagged', 'score9', 'score4', 'plain']);
  });
});

describe('portal demo: reply and lockdown', () => {
  test('a reply joins the thread root as the owner, and only on a published comment', async () => {
    const store = storeOf(row('root', 'published'), row('child', 'published', { parentId: 'root' }), row('held', 'held'));
    const { body } = await call(store, 'POST', 'comments/child/reply', { body: '  Thanks!  ' });
    expect(body.comment).toMatchObject({ parentId: 'root', status: 'published' });
    expect(store.comments[0]).toMatchObject({ id: body.comment.id, body: 'Thanks!', verified: true });
    expect((await call(store, 'POST', 'comments/held/reply', { body: 'hi' })).body.error).toBe('target_unavailable');
    expect((await call(store, 'POST', 'comments/root/reply', { body: '   ' })).body.error).toBe('invalid_body');
    // The owner's row carries the badge flag; the others do not.
    expect(store.comments.find((comment) => comment.id === body.comment.id)!.byAuthor).toBe(true);
    expect(store.comments.find((comment) => comment.id === 'root')!.byAuthor).toBe(false);
  });

  test('a replyId becomes the reply\'s id, and a retry answers the first reply without a second', async () => {
    const store = storeOf(row('root', 'published'), row('child', 'published', { parentId: 'root' }));
    const replyId = crypto.randomUUID();
    const first = await call(store, 'POST', 'comments/child/reply', { body: 'Thanks!', replyId });
    expect(first.status).toBe(200);
    expect(first.body.comment).toEqual({ id: replyId, parentId: 'root', status: 'published' });
    const count = store.comments.length;

    // Same id, another spelling, the same thread by its root, a body that
    // trims the same: the first reply again, nothing written.
    const retry = await call(store, 'POST', 'comments/root/reply', { body: ' Thanks! ', replyId: replyId.toUpperCase() });
    expect(retry.status).toBe(200);
    expect(retry.body.comment).toEqual(first.body.comment);
    expect(store.comments).toHaveLength(count);
    expect(store.activity.filter((entry) => entry.targetId === replyId)).toHaveLength(1);

    // It still answers after the comment it replied to was deleted.
    store.comments.find((comment) => comment.id === 'child')!.status = 'deleted';
    expect((await call(store, 'POST', 'comments/child/reply', { body: 'Thanks!', replyId })).body.comment.id).toBe(replyId);
  });

  test('the same replyId with another body or thread is a 409; a malformed one is a 400', async () => {
    const store = storeOf(row('root', 'published'), row('other', 'published'));
    const replyId = crypto.randomUUID();
    await call(store, 'POST', 'comments/root/reply', { body: 'First', replyId });
    const count = store.comments.length;

    const edited = await call(store, 'POST', 'comments/root/reply', { body: 'First, edited', replyId });
    expect(edited.status).toBe(409);
    expect(edited.body.error).toBe('reply_id_collision');
    const elsewhere = await call(store, 'POST', 'comments/other/reply', { body: 'First', replyId });
    expect(elsewhere.body.error).toBe('reply_id_collision');
    expect((await call(store, 'POST', 'comments/root/reply', { body: 'First', replyId: 'not-a-uuid' })).body.error).toBe('invalid_reply_id');
    expect((await call(store, 'POST', 'comments/root/reply', { body: 'First', replyId: 42 })).status).toBe(400);
    expect(store.comments).toHaveLength(count);

    // Without one, every call writes a new reply.
    await call(store, 'POST', 'comments/root/reply', { body: 'Again' });
    await call(store, 'POST', 'comments/root/reply', { body: 'Again' });
    expect(store.comments).toHaveLength(count + 2);
  });

  test('the owner engages, replaces and lifts a lockdown; the detector does not replace one', async () => {
    const store = storeOf();
    expect((await call(store, 'GET', 'comments/lockdown')).body).toEqual({ lockdown: null });
    expect((await call(store, 'POST', 'comments/lockdown', { minutes: 0 })).body.error).toBe('invalid_minutes');
    expect((await call(store, 'POST', 'comments/lockdown', { minutes: 60, note: 'x'.repeat(201) })).body.error).toBe('invalid_note');

    const engaged = await call(store, 'POST', 'comments/lockdown', { minutes: 60 });
    expect(engaged.body.lockdown).toMatchObject({ by: 'owner', reason: 'engaged by the owner' });
    expect(engageAutoLockdown(store, 'a flood')).toBeNull();
    expect((await call(store, 'POST', 'comments/lockdown', { minutes: 5, note: ' raid ' })).body.lockdown.reason).toBe('raid');
    expect((await call(store, 'DELETE', 'comments/lockdown')).body).toEqual({ lockdown: null });

    expect(engageAutoLockdown(store, 'a flood')).toMatchObject({ by: 'auto', reason: 'a flood' });
    expect((await call(store, 'GET', 'comments/lockdown')).body.lockdown.by).toBe('auto');
  });
});
