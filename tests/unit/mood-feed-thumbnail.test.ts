import { describe, expect, test } from 'bun:test';

import {
  getMoodFeedThumbnailStyle,
  resolveMoodFeedImageLayout,
} from '../../src/features/mood/shared/feed-thumbnail';

describe('mood feed thumbnails', () => {
  test('does not reserve a square background when image height is unknown', () => {
    expect(getMoodFeedThumbnailStyle({ imageWidth: 800, imageHeight: null })).toBeUndefined();
  });

  test('reserves the real aspect ratio when both image dimensions are known', () => {
    expect(getMoodFeedThumbnailStyle({ imageWidth: 800, imageHeight: 450 })).toBe(
      'aspect-ratio:800 / 450;--mood-thumb-ratio:800 / 450;'
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
      'aspect-ratio:600 / 800;--mood-thumb-ratio:600 / 800;--mood-thumb-reserved-width:210px;--mood-thumb-reserved-width-sm:240px;--mood-thumb-reserved-width-lg:260px;'
    );
  });

  test('derives the portrait box when image layout metadata is missing', () => {
    expect(resolveMoodFeedImageLayout(null, 960, 1280)).toBe('portrait');
    expect(
      getMoodFeedThumbnailStyle({
        imageWidth: 960,
        imageHeight: 1280,
        imageLayout: null,
      })
    ).toBe(
      'aspect-ratio:960 / 1280;--mood-thumb-ratio:960 / 1280;--mood-thumb-reserved-width:210px;--mood-thumb-reserved-width-sm:240px;--mood-thumb-reserved-width-lg:260px;'
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
      'aspect-ratio:400 / 1000;--mood-thumb-ratio:400 / 1000;--mood-thumb-reserved-width:128px;--mood-thumb-reserved-width-sm:144px;--mood-thumb-reserved-width-lg:160px;'
    );
  });
});
