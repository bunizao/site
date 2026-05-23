import { describe, expect, test } from 'bun:test';

import {
  getMoodFeedAnchorBeforeCursor,
  isMoodFeedAnchorId,
  readMoodFeedAnchorId,
} from '../../src/features/mood/shared/feed-anchor';

describe('mood feed anchors', () => {
  test('reads bare post ids from mood feed URLs', () => {
    expect(readMoodFeedAnchorId(new URL('https://example.com/mood?3196'))).toBe('3196');
    expect(readMoodFeedAnchorId(new URL('https://example.com/mood?post=3196'))).toBe('3196');
    expect(readMoodFeedAnchorId(new URL('https://example.com/mood?id=3196'))).toBe('3196');
  });

  test('rejects invalid anchor values', () => {
    expect(isMoodFeedAnchorId('3196')).toBe(true);
    expect(isMoodFeedAnchorId('0')).toBe(false);
    expect(isMoodFeedAnchorId('3196x')).toBe(false);
    expect(readMoodFeedAnchorId(new URL('https://example.com/mood?tag=life'))).toBe('');
  });

  test('builds an inclusive before cursor for Telegram', () => {
    expect(getMoodFeedAnchorBeforeCursor('3196')).toBe('3197');
    expect(getMoodFeedAnchorBeforeCursor('')).toBe('');
  });
});
