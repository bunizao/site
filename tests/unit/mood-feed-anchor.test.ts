import { describe, expect, test } from 'bun:test';

import {
  getMoodDetailRedirectPath,
  getMoodFeedAnchorAfterCursor,
  getMoodFeedAnchorBeforeCursor,
  isMoodFeedAnchorId,
  mergeMoodFeedWindowPosts,
  readMoodDetailRedirectId,
  readMoodFeedAnchorId,
} from '../../src/features/mood/shared/feed-anchor';

describe('mood feed anchors', () => {
  test('reads explicit post ids from mood feed URLs', () => {
    expect(readMoodFeedAnchorId(new URL('https://example.com/mood?post=3196'))).toBe('3196');
  });

  test('rejects invalid anchor values', () => {
    expect(isMoodFeedAnchorId('3196')).toBe(true);
    expect(isMoodFeedAnchorId('0')).toBe(false);
    expect(isMoodFeedAnchorId('3196x')).toBe(false);
    expect(readMoodFeedAnchorId(new URL('https://example.com/mood?3196'))).toBe('');
    expect(readMoodFeedAnchorId(new URL('https://example.com/mood?id=3196'))).toBe('');
    expect(readMoodFeedAnchorId(new URL('https://example.com/mood?tag=life'))).toBe('');
  });

  test('maps legacy query ids to canonical detail paths', () => {
    const bare = new URL('https://example.com/mood?3196');
    const named = new URL('https://example.com/mood?id=3196&embed=1');

    expect(readMoodDetailRedirectId(bare)).toBe('3196');
    expect(readMoodDetailRedirectId(named)).toBe('3196');
    expect(getMoodDetailRedirectPath(bare, '3196')).toBe('/mood/3196');
    expect(getMoodDetailRedirectPath(named, '3196')).toBe('/mood/3196?embed=1');
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
