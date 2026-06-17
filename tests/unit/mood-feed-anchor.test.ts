import { describe, expect, test } from 'bun:test';

import {
  getMoodDetailHref,
  getMoodFeedAnchorBeforeCursor,
  getMoodFeedAnchorFragmentId,
  getMoodFeedAnchorHref,
  getMoodFeedAnchorWindowBeforeCursor,
  isMoodFeedAnchorId,
  mergeMoodFeedWindowPosts,
  readMoodFeedAnchorId,
} from '../../src/features/mood/shared/feed-anchor';

describe('mood feed anchors', () => {
  test('reads short and explicit post ids from mood feed URLs', () => {
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

  test('builds deterministic feed return anchors', () => {
    expect(getMoodFeedAnchorFragmentId('3196')).toBe('mood-3196');
    expect(getMoodFeedAnchorHref('3196')).toBe('/mood?3196');
    expect(getMoodFeedAnchorFragmentId('bad')).toBe('');
    expect(getMoodFeedAnchorHref('bad')).toBe('/mood');
  });

  test('builds clean detail links', () => {
    expect(getMoodDetailHref('3196')).toBe('/mood/3196');
    expect(getMoodDetailHref('3196', '#comments')).toBe('/mood/3196#comments');
    expect(getMoodDetailHref('bad')).toBe('/mood');
  });

  test('builds an inclusive before cursor for Telegram', () => {
    expect(getMoodFeedAnchorBeforeCursor('3196')).toBe('3197');
    expect(getMoodFeedAnchorBeforeCursor('')).toBe('');
  });

  test('builds a bounded before cursor for nearby anchor windows', () => {
    expect(getMoodFeedAnchorWindowBeforeCursor('3196')).toBe('3207');
    expect(getMoodFeedAnchorWindowBeforeCursor('')).toBe('');
  });

  test('merges anchor window posts in feed order', () => {
    const posts = mergeMoodFeedWindowPosts(
      [{ id: '3198' }, { id: '3197' }, { id: '3196' }],
      [{ id: '3196' }, { id: '3195' }]
    );

    expect(posts.map((post) => post.id)).toEqual(['3198', '3197', '3196', '3195']);
  });
});
