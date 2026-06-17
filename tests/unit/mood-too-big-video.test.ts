import { describe, expect, test } from 'bun:test';
import type { MediaItem } from '@bunizao/contracts/content';
import { renderStructuredMoodFeedMediaMarkup } from '../../src/features/mood/shared/feed-media';

function tooBigVideo(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    type: 'document',
    mimeType: 'video',
    title: 'Media is too big',
    originalUrl: 'https://t.me/tutumood/3515',
    ...overrides,
  } as MediaItem;
}

describe('too-big video duration badge', () => {
  test('renders the duration in the corner, not a timestamp', () => {
    const html = renderStructuredMoodFeedMediaMarkup([tooBigVideo({ durationSeconds: 95 })]);

    expect(html).toContain('class="video-too-big__duration"');
    expect(html).toContain('>1:35<');
    expect(html).not.toContain('video-too-big__timestamp');
  });

  test('formats durations over an hour as H:MM:SS', () => {
    const html = renderStructuredMoodFeedMediaMarkup([tooBigVideo({ durationSeconds: 3725 })]);

    expect(html).toContain('>1:02:05<');
  });

  test('omits the badge when no duration is known', () => {
    const html = renderStructuredMoodFeedMediaMarkup([tooBigVideo()]);

    expect(html).toContain('class="video-too-big"');
    expect(html).not.toContain('video-too-big__duration');
  });
});
