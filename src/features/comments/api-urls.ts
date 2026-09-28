/* Comment and reaction read URLs, shared by the inline prefetch (server) and
   the controllers (client) so a prefetched response is found by exact URL. */

export const COMMENTS_PAGE_SIZE = 20;

export const READER_ME_URL = '/api/v2/reader/me';

export function blogCommentsUrl(postId: string, before = ''): string {
  const cursor = before ? `&before=${encodeURIComponent(before)}` : '';
  return `/api/v2/comments?post=${encodeURIComponent(postId)}${cursor}&limit=${COMMENTS_PAGE_SIZE}`;
}

export function reactionsUrl(targets: string[]): string {
  return `/api/v2/reactions?targets=${encodeURIComponent(targets.join(','))}`;
}

/** The mood thread's site rows, first page only. `/api/comments` (below) is
    the thread a reader sees; this is where the owner's pin, lock and mode
    for it live, and where a writer's own held row shows up. */
export function moodSiteCommentsUrl(postId: string): string {
  return `/api/v2/comments?surface=mood&post=${encodeURIComponent(postId)}&limit=${COMMENTS_PAGE_SIZE}`;
}

export function moodCommentsUrl(postId: string, before = ''): string {
  const query = new URLSearchParams({ postId });
  if (before) query.set('before', before);
  return `/api/comments?${query}`;
}
