/* What the owner's pin and lock mean for one page of a thread, read once from
   the `/api/v2/comments` list and shared by both surfaces that draw it: the
   blog thread (client/comments-controller.ts) and the mood L2 thread
   (mood/client/detail-comments-controller.ts).

   The wire marks roots only -- `pinned` and `locked` are never set on a reply
   (packages/contracts/src/comments.ts). What a lock does to the replies under
   a root is this file's rule, so the two threads cannot disagree on it. */

import type { Comment } from '@bunizao/contracts/comments';

type MarkedRow = Pick<Comment, 'id' | 'parentId' | 'pinned' | 'locked'>;

export interface ThreadMarks {
  /** The pinned root's id, or null. The server allows one per post. */
  pinnedId: string | null;
  /** Roots whose thread takes no more replies. They say so on the row. */
  lockedRoots: ReadonlySet<string>;
  /** Every row that must not offer Reply: each locked root, and each reply
      under one. Threading is one level deep, so a reply to a reply is a
      reply to the root, and the server refuses it with `thread_locked`. */
  noReply: ReadonlySet<string>;
}

export const NO_THREAD_MARKS: ThreadMarks = {
  pinnedId: null,
  lockedRoots: new Set(),
  noReply: new Set(),
};

export function readThreadMarks(comments: readonly MarkedRow[]): ThreadMarks {
  let pinnedId: string | null = null;
  const lockedRoots = new Set<string>();
  for (const comment of comments) {
    if (comment.parentId !== null) continue;
    if (comment.pinned === true && pinnedId === null) pinnedId = comment.id;
    if (comment.locked === true) lockedRoots.add(comment.id);
  }
  const noReply = new Set(lockedRoots);
  for (const comment of comments) {
    if (comment.parentId !== null && lockedRoots.has(comment.parentId)) noReply.add(comment.id);
  }
  return { pinnedId, lockedRoots, noReply };
}
