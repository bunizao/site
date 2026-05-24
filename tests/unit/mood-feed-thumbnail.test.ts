import { describe, expect, test } from 'bun:test';

import { getMoodFeedThumbnailStyle } from '../../src/features/mood/shared/feed-thumbnail';

describe('mood feed thumbnails', () => {
  test('does not reserve a square background when image height is unknown', () => {
    expect(getMoodFeedThumbnailStyle({ imageWidth: 800, imageHeight: null })).toBeUndefined();
  });

  test('reserves the real aspect ratio when both image dimensions are known', () => {
    expect(getMoodFeedThumbnailStyle({ imageWidth: 800, imageHeight: 450 })).toBe('aspect-ratio:800 / 450;');
  });
});
