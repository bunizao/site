const MOOD_FEED_ANCHOR_PATTERN = /^[1-9]\d{0,19}$/;
const MOOD_FEED_ANCHOR_WINDOW_OFFSET = 10n;
export const MOOD_FEED_RETURN_ANCHOR_STORAGE_KEY = 'mood-feed-return-anchor';
type MoodApiModeQueryValue = 'true' | 'false' | null;

export function isMoodFeedAnchorId(value: string): boolean {
  return MOOD_FEED_ANCHOR_PATTERN.test(value.trim());
}

export function readMoodFeedAnchorId(url: URL): string {
  const named = (url.searchParams.get('post') ?? url.searchParams.get('id') ?? '').trim();
  if (isMoodFeedAnchorId(named)) return named;

  for (const [key, value] of url.searchParams) {
    const candidate = key.trim();
    if (!value.trim() && isMoodFeedAnchorId(candidate)) {
      return candidate;
    }
  }

  return '';
}

export function getMoodFeedAnchorFragmentId(anchorId: string): string {
  const id = anchorId.trim();
  return isMoodFeedAnchorId(id) ? `mood-${id}` : '';
}

function moodApiModeQuery(mode: MoodApiModeQueryValue): string {
  return mode ? `api-v2=${mode}` : '';
}

export function getMoodDetailHref(postId: string, mode: MoodApiModeQueryValue = null, hash = ''): string {
  const id = postId.trim();
  if (!isMoodFeedAnchorId(id)) return '/mood';

  const query = moodApiModeQuery(mode);
  const safeHash = hash.startsWith('#') ? hash : '';
  return `/mood/${id}${query ? `?${query}` : ''}${safeHash}`;
}

export function getMoodFeedAnchorHref(anchorId: string, mode: MoodApiModeQueryValue = null): string {
  const id = anchorId.trim();
  const modeQuery = moodApiModeQuery(mode);
  if (!isMoodFeedAnchorId(id)) {
    return modeQuery ? `/mood?${modeQuery}` : '/mood';
  }

  return `/mood?${id}${modeQuery ? `&${modeQuery}` : ''}`;
}

function addMoodFeedCursorOffset(anchorId: string, offset: bigint): string {
  if (!isMoodFeedAnchorId(anchorId)) return '';

  const cursor = (BigInt(anchorId) + offset).toString();
  return cursor.length <= 20 ? cursor : anchorId;
}

export function getMoodFeedAnchorBeforeCursor(anchorId: string): string {
  return addMoodFeedCursorOffset(anchorId, 1n);
}

export function getMoodFeedAnchorWindowBeforeCursor(anchorId: string): string {
  return addMoodFeedCursorOffset(anchorId, MOOD_FEED_ANCHOR_WINDOW_OFFSET + 1n);
}

function compareMoodFeedIdsDescending(a: string, b: string): number {
  const left = BigInt(a);
  const right = BigInt(b);
  if (left === right) return 0;
  return left > right ? -1 : 1;
}

export function mergeMoodFeedWindowPosts<T extends { id?: string | null }>(...groups: T[][]): T[] {
  const postsById = new Map<string, T>();

  groups.flat().forEach((post) => {
    const id = post.id?.trim() ?? '';
    if (!isMoodFeedAnchorId(id) || postsById.has(id)) return;
    postsById.set(id, post);
  });

  return Array.from(postsById.values()).sort((a, b) => {
    return compareMoodFeedIdsDescending(a.id ?? '0', b.id ?? '0');
  });
}
