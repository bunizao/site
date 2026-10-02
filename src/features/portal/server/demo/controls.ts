/* Demo answers for the owner's pin and thread lock on one comment.

   Same paths, rules and codes as site-api (src/pages/admin/comments/[id]/
   pin.ts and lock.ts, features/comments/server/comment-controls.ts there):

   - Pin: only a published root can be pinned, else 409
     `comment_not_pinnable`. Pinning takes the post's pin from whichever
     comment had it and names that one in `replaced`. Pinning the pin again
     keeps its first time. DELETE answers the same whether or not it was
     pinned.
   - Lock: goes on the thread root; a reply's id resolves to its root and
     the answer names the root. Locking a locked thread keeps its first
     time. A mood row answering a Telegram comment would be 409
     `comment_not_lockable` (and `comment_not_pinnable`); the demo has no
     such rows, so it never says either for that reason.
   - Unknown id: 404 `comment_not_found`.
   - A change is logged as `comment.moderate` with a note.

   Both live on the record, as `pinned_at` and `locked_at` live on the row
   in site-api, so the queue lists them with no extra step. Only imported
   behind `import.meta.env.DEV`. */

import type { AdminCommentLockResponse, AdminCommentPinResponse, AdminCommentRecord, CommentSurface } from '@bunizao/contracts';
import type { CommentAdminStore } from './comment-admin';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Portal-Demo': '1' },
  });
}

function fail(status: number, code: string): Response {
  return json({ error: code, message: code }, status);
}

function surfaceOf(row: AdminCommentRecord): CommentSurface {
  return row.surface ?? (/^\d+$/.test(row.postId) ? 'mood' : 'blog');
}

function log(store: CommentAdminStore, row: AdminCommentRecord, note: string): void {
  store.activity.unshift({
    id: `ac_demo_${crypto.randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
    event: 'comment.moderate',
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
    reason: null,
    note: `${note} from the admin portal.`,
  });
}

function pin(store: CommentAdminStore, id: string, method: string): Response | null {
  const row = store.comments.find((comment) => comment.id === id);
  if (!row) return fail(404, 'comment_not_found');
  const surface = surfaceOf(row);
  const comment = { id: row.id, surface, postId: row.postId };

  if (method === 'DELETE') {
    if (row.pinnedAt) log(store, row, 'Unpinned');
    row.pinnedAt = null;
    return json({ comment: { ...comment, pinnedAt: null }, replaced: null } satisfies AdminCommentPinResponse);
  }
  if (method !== 'PUT') return null;
  if (row.parentId !== null || row.status !== 'published') return fail(409, 'comment_not_pinnable');

  const previous = store.comments.find((other) =>
    other.pinnedAt && other.id !== row.id && surfaceOf(other) === surface && other.postId === row.postId);
  if (previous) previous.pinnedAt = null;
  const already = row.pinnedAt;
  row.pinnedAt = already ?? new Date().toISOString();
  if (!already) log(store, row, 'Pinned');
  return json({ comment: { ...comment, pinnedAt: row.pinnedAt }, replaced: previous?.id ?? null } satisfies AdminCommentPinResponse);
}

function lock(store: CommentAdminStore, id: string, method: string): Response | null {
  if (method !== 'PUT' && method !== 'DELETE') return null;
  const row = store.comments.find((comment) => comment.id === id);
  if (!row) return fail(404, 'comment_not_found');
  const root = row.parentId === null ? row : store.comments.find((comment) => comment.id === row.parentId);
  if (!root) return fail(404, 'comment_not_found');
  const comment = { id: root.id, surface: surfaceOf(root), postId: root.postId };

  if (method === 'DELETE') {
    if (root.lockedAt) log(store, root, 'Replies unlocked');
    root.lockedAt = null;
    return json({ comment: { ...comment, lockedAt: null } } satisfies AdminCommentLockResponse);
  }
  const already = root.lockedAt;
  root.lockedAt = already ?? new Date().toISOString();
  if (!already) log(store, root, 'Replies locked');
  return json({ comment: { ...comment, lockedAt: root.lockedAt } } satisfies AdminCommentLockResponse);
}

/** Answers `admin/comments/:id/pin` and `admin/comments/:id/lock`, or null
    for any other path. `segments` starts after `admin`. */
export async function handleCommentControlsDemo(
  request: Request,
  segments: string[],
  store: CommentAdminStore,
): Promise<Response | null> {
  const [resource, id, control, ...rest] = segments;
  if (resource !== 'comments' || !id || rest.length > 0) return null;
  const method = request.method.toUpperCase();
  if (control === 'pin') return pin(store, id, method);
  if (control === 'lock') return lock(store, id, method);
  return null;
}
