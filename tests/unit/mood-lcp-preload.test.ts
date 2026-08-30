import { describe, expect, test } from 'bun:test';
import { getMoodFeedPreloadImage } from '../../src/features/mood/shared/lcp-preload';
import { getMoodGallerySizes } from '../../src/features/mood/shared/gallery-render';
import { getMoodFeedThumbSizes, MOOD_FEED_IMAGE_SIZES } from '../../src/features/mood/shared/image-srcset';
import type { MoodFeedItem } from '@bunizao/contracts/mood';
import type { MediaItem } from '@bunizao/contracts/content';

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

const ARCHIVE_IMAGE = 'https://buxx.me/api/v2/images/mood/1/0';
const ARCHIVE_GALLERY_IMAGE = 'https://buxx.me/api/v2/images/mood/1/1';

describe('mood lcp preload selection', () => {
  test('returns no preload when there is no renderable media', () => {
    const posts = Array.from({ length: 4 }, (_, index) => createPost(String(index + 1)));
    expect(getMoodFeedPreloadImage(posts)).toBeNull();
  });

  test('preloads the first image thumb with feed sizes', () => {
    const posts = [
      createPost('1'),
      createPost('2', { image: ARCHIVE_IMAGE }),
    ];

    const preload = getMoodFeedPreloadImage(posts);
    expect(preload?.href).toBe(ARCHIVE_IMAGE);
    expect(preload?.imageSizes).toBe(MOOD_FEED_IMAGE_SIZES);
    expect(preload?.imageSrcSet).toContain('320w');
  });

  test('preloads a portrait thumb with the contained-layout sizes', () => {
    const posts = [
      createPost('1', { image: ARCHIVE_IMAGE, imageWidth: 600, imageHeight: 900 }),
    ];

    // Must match the sizes FeedShell renders on the thumb <img>, or the
    // preload and the element fetch different responsive candidates.
    const preload = getMoodFeedPreloadImage(posts);
    expect(preload?.imageSizes).toBe(getMoodFeedThumbSizes('portrait'));
    expect(preload?.imageSizes).not.toBe(MOOD_FEED_IMAGE_SIZES);
  });

  test('preloads the gallery first item with gallery sizes', () => {
    const posts = [
      createPost('1', {
        gallery: {
          count: 2,
          items: [
            { src: ARCHIVE_GALLERY_IMAGE, fallbackSrc: null, width: 1200, height: 900, layout: 'landscape', alt: '' },
            { src: 'https://buxx.me/api/v2/images/mood/1/2', fallbackSrc: null, width: 800, height: 600, layout: 'landscape', alt: '' },
          ],
        },
      }),
    ];

    const preload = getMoodFeedPreloadImage(posts);
    expect(preload?.href).toBe(ARCHIVE_GALLERY_IMAGE);
    expect(preload?.imageSizes).toBe(getMoodGallerySizes('feed'));
    expect(preload?.imageSizes).not.toBe(MOOD_FEED_IMAGE_SIZES);
  });

  test('skips a video post and its trailing image (no wasted high-priority fetch)', () => {
    const videoMedia: MediaItem = {
      type: 'video',
      src: 'https://buxx.me/api/v2/videos/mood/1/0.mp4',
      width: 1280,
      height: 720,
    } as MediaItem;
    const posts = [
      createPost('1', { media: [videoMedia] }),
      createPost('2', { image: ARCHIVE_IMAGE }),
    ];

    // The priority element is the video post; it renders no high-priority <img>.
    expect(getMoodFeedPreloadImage(posts)).toBeNull();
  });

  test('skips a too-big-video priority post', () => {
    const posts = [
      createPost('1', {
        previewMediaType: 'too-big-video',
        image: ARCHIVE_IMAGE,
      }),
    ];

    expect(getMoodFeedPreloadImage(posts)).toBeNull();
  });
});
