/* Which mood comments this browser wrote. There is no reader session on the
   mood surface -- every write is anonymous -- so "mark this row as mine" has
   nothing to check against but a browser-local memory of ids this tab has
   itself posted, kept across reloads in localStorage next to the drafts and
   claimed-identity stores the blog comments already use.

   Keyed by `Comment.commentId` (the site row id), not by the `id` a rendered
   MoodComment carries: an own comment's display id starts as a temporary
   value from the create response and later becomes the Telegram message id
   once the bridge lands and a scrape picks it up, but `commentId` is stable
   across that change -- see plans/mood-comments-bridge.md "Read path: scrape
   plus overlay". */

const STORAGE_KEY = 'buxx:mood:own-comment-ids';

/** Capped so a very active commenter's localStorage entry stays bounded --
    only the most recent ids are worth remembering, since older comments are
    unlikely to still be on screen to mark. */
const MAX_REMEMBERED_IDS = 200;

/** Parses the JSON array persisted at STORAGE_KEY. Never throws: a missing,
    corrupt, or foreign value all come back as "nothing remembered" rather
    than breaking the render. */
export function parseOwnCommentIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** Appends `id`, de-duplicated and moved to the end (most-recently-posted
    last), capped to the most recent MAX_REMEMBERED_IDS. */
export function withOwnCommentId(ids: string[], id: string): string[] {
  if (!id) return ids;
  const next = ids.filter((existing) => existing !== id);
  next.push(id);
  return next.length > MAX_REMEMBERED_IDS ? next.slice(next.length - MAX_REMEMBERED_IDS) : next;
}

/** Best-effort read. Private windows and blocked site data throw on access;
    a reader who cannot store this should still see the thread. */
export function readOwnCommentIds(): Set<string> {
  try {
    return new Set(parseOwnCommentIds(localStorage.getItem(STORAGE_KEY)));
  } catch {
    return new Set();
  }
}

/** Called once a comment this browser wrote is confirmed published. */
export function rememberOwnCommentId(commentId: string): void {
  if (!commentId) return;
  try {
    const ids = parseOwnCommentIds(localStorage.getItem(STORAGE_KEY));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(withOwnCommentId(ids, commentId)));
  } catch {
    /* Storage unavailable -- the row still renders as mine for this load,
       just not remembered for the next one. */
  }
}
