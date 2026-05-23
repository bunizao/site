const MOOD_FEED_ANCHOR_PATTERN = /^[1-9]\d{0,19}$/;

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

export function getMoodFeedAnchorBeforeCursor(anchorId: string): string {
  if (!isMoodFeedAnchorId(anchorId)) return '';

  const nextId = BigInt(anchorId) + 1n;
  const cursor = nextId.toString();
  return cursor.length <= 20 ? cursor : anchorId;
}
