import { describe, expect, test } from 'bun:test';

import { getMoodFeedThumbnailStyle } from '../../src/features/mood/shared/feed-thumbnail';

describe('mood feed thumbnails', () => {
  test('reserves a stable fallback box when image height is unknown', () => {
    expect(getMoodFeedThumbnailStyle({ imageWidth: 800, imageHeight: null })).toBe(
      'aspect-ratio:4 / 3;--mood-thumb-ratio:4 / 3;--mood-image-ratio:4 / 3;'
    );
  });

  test('reserves the real aspect ratio when both image dimensions are known', () => {
    expect(getMoodFeedThumbnailStyle({ imageWidth: 800, imageHeight: 450 })).toBe(
      'aspect-ratio:800 / 450;--mood-thumb-ratio:800 / 450;--mood-image-ratio:800 / 450;'
    );
  });

  test('uses stable media-specific ratios when dimensions are missing', () => {
    expect(getMoodFeedThumbnailStyle({ mediaKind: 'sticker' })).toBe(
      'aspect-ratio:1 / 1;--mood-thumb-ratio:1 / 1;--mood-image-ratio:1 / 1;'
    );
    expect(getMoodFeedThumbnailStyle({ mediaKind: 'video' })).toBe(
      'aspect-ratio:16 / 9;--mood-thumb-ratio:16 / 9;--mood-image-ratio:16 / 9;'
    );
  });

  test('reserves the portrait box before the image loads', () => {
    expect(
      getMoodFeedThumbnailStyle({
        imageWidth: 600,
        imageHeight: 800,
        imageLayout: 'portrait',
      })
    ).toBe(
      'aspect-ratio:600 / 800;--mood-thumb-ratio:600 / 800;--mood-image-ratio:600 / 800;--mood-thumb-reserved-width:210px;--mood-thumb-reserved-width-sm:240px;--mood-thumb-reserved-width-lg:260px;'
    );
  });

  test('reserves the ultra-tall box before the image loads', () => {
    expect(
      getMoodFeedThumbnailStyle({
        imageWidth: 400,
        imageHeight: 1000,
        imageLayout: 'ultra-tall',
      })
    ).toBe(
      'aspect-ratio:400 / 1000;--mood-thumb-ratio:400 / 1000;--mood-image-ratio:400 / 1000;--mood-thumb-reserved-width:128px;--mood-thumb-reserved-width-sm:144px;--mood-thumb-reserved-width-lg:160px;'
    );
  });
});
