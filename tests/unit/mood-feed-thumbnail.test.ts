import { describe, expect, test } from 'bun:test';

import { getMoodFeedThumbnailStyle } from '../../src/features/mood/shared/feed-thumbnail';

describe('mood feed thumbnails', () => {
  test('does not reserve a square background when image height is unknown', () => {
    expect(getMoodFeedThumbnailStyle({ imageWidth: 800, imageHeight: null })).toBeUndefined();
  });

  test('reserves the real aspect ratio when both image dimensions are known', () => {
    expect(getMoodFeedThumbnailStyle({ imageWidth: 800, imageHeight: 450 })).toBe(
      'aspect-ratio:800 / 450;--mood-thumb-ratio:800 / 450;'
    );
  });

  test('reserves the priority portrait box before the image loads', () => {
    expect(
      getMoodFeedThumbnailStyle({
        imageWidth: 600,
        imageHeight: 800,
        imageLayout: 'portrait',
        priority: true,
      })
    ).toBe(
      'aspect-ratio:600 / 800;--mood-thumb-ratio:600 / 800;--mood-thumb-reserved-width:210px;--mood-thumb-reserved-width-sm:240px;--mood-thumb-reserved-width-lg:260px;'
    );
  });
});
