import { describe, expect, test } from 'bun:test';

import {
  getMoodFeedAnchorAfterCursor,
  getMoodFeedAnchorBeforeCursor,
  isMoodFeedAnchorId,
  mergeMoodFeedWindowPosts,
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

  test('builds an exclusive after cursor for Telegram', () => {
    expect(getMoodFeedAnchorAfterCursor('3196')).toBe('3196');
    expect(getMoodFeedAnchorAfterCursor('')).toBe('');
  });

  test('merges anchor window posts in feed order', () => {
    const posts = mergeMoodFeedWindowPosts(
      [{ id: '3198' }, { id: '3197' }, { id: '3196' }],
      [{ id: '3196' }, { id: '3195' }]
    );

    expect(posts.map((post) => post.id)).toEqual(['3198', '3197', '3196', '3195']);
  });
});
