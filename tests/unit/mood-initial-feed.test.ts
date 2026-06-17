import { describe, expect, test } from 'bun:test';
import { getCriticalInitialPosts } from '../../src/features/mood/shared/initial-feed';
import type { MoodFeedItem } from '@bunizao/contracts/mood';

function createPost(id: string, overrides: Partial<MoodFeedItem> = {}): MoodFeedItem {
  return {
    id,
    datetime: '2026-06-17T00:00:00+00:00',
    tag: '',
    previewText: `Mood ${id}`,
    previewHtml: `Mood ${id}`,
    media: [],
    gallery: null,
    image: null,
    imageFallback: null,
    imageWidth: null,
    imageHeight: null,
    imageLayout: null,
    imageKind: null,
    mediaHtml: '',
    needsDetailPage: false,
    forwardedFrom: null,
    quote: null,
    reactions: [],
    commentsCount: 0,
    ...overrides,
  };
}

describe('critical mood initial feed selection', () => {
  test('keeps enough server-rendered posts when the first post has media', () => {
    const posts = Array.from({ length: 12 }, (_, index) => createPost(String(index + 1)));
    posts[0] = createPost('1', { image: 'https://image.example.test/mood/1/0' });

    expect(getCriticalInitialPosts(posts).map((post) => post.id)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
    ]);
  });

  test('includes the first media post beyond the base limit', () => {
    const posts = Array.from({ length: 12 }, (_, index) => createPost(String(index + 1)));
    posts[10] = createPost('11', { mediaHtml: '<a class="bookmark-card" href="https://example.test">Example</a>' });

    expect(getCriticalInitialPosts(posts).map((post) => post.id)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '11',
    ]);
  });

  test('includes a required anchor post beyond media and base limits', () => {
    const posts = Array.from({ length: 12 }, (_, index) => createPost(String(index + 1)));

    expect(getCriticalInitialPosts(posts, '10').map((post) => post.id)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
    ]);
  });
});
