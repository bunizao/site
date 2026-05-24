const MOOD_FEED_ANCHOR_PATTERN = /^[1-9]\d{0,19}$/;

export function isMoodFeedAnchorId(value: string): boolean {
  return MOOD_FEED_ANCHOR_PATTERN.test(value.trim());
}

export function readMoodFeedAnchorId(url: URL): string {
  const named = (url.searchParams.get('post') ?? '').trim();
  if (isMoodFeedAnchorId(named)) return named;

  return '';
}

export function readMoodDetailRedirectId(url: URL): string {
  const named = (url.searchParams.get('id') ?? '').trim();
  if (isMoodFeedAnchorId(named)) return named;

  for (const [key, value] of url.searchParams) {
    const candidate = key.trim();
    if (!value.trim() && isMoodFeedAnchorId(candidate)) {
      return candidate;
    }
  }

  return '';
}

export function getMoodDetailRedirectPath(url: URL, id: string): string {
  const redirectUrl = new URL(`/mood/${id}`, url);

  for (const [key, value] of url.searchParams) {
    const isBareId = !value.trim() && key.trim() === id;
    if (key === 'id' || isBareId) continue;
    redirectUrl.searchParams.append(key, value);
  }

  return `${redirectUrl.pathname}${redirectUrl.search}`;
}

export function getMoodFeedAnchorBeforeCursor(anchorId: string): string {
  if (!isMoodFeedAnchorId(anchorId)) return '';

  const nextId = BigInt(anchorId) + 1n;
  const cursor = nextId.toString();
  return cursor.length <= 20 ? cursor : anchorId;
}

export function getMoodFeedAnchorAfterCursor(anchorId: string): string {
  return isMoodFeedAnchorId(anchorId) ? anchorId : '';
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
