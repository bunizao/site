import { describe, expect, test } from 'bun:test';

import {
  MoodArchiveHttpError,
  loadMoodArchiveWithFallback,
} from '../../src/features/mood/server/api-client';

// Owner decision: site-api's `mood_feed_failed` / `mood_detail_failed` codes
// mean *its* fallback chain (D1 -> t.me) is exhausted, not that the site's own
// independent live reader is. loadMoodArchiveWithFallback must still attempt
// it, and only fail when that also fails.
describe('mood archive exhaustion fallback', () => {
  test('still tries the live reader when the archive reports its own fallbacks exhausted', async () => {
    const originalWarn = console.warn;
    console.warn = () => {};

    try {
      const result = await loadMoodArchiveWithFallback(
        'feed',
        async () => {
          throw new MoodArchiveHttpError(500, 'Internal Server Error', 'mood_feed_failed');
        },
        async () => 'live result',
      );

      expect(result).toBe('live result');
    } finally {
      console.warn = originalWarn;
    }
  });

  test('propagates the live reader failure, not the archive exhaustion error, when both fail', async () => {
    const originalWarn = console.warn;
    console.warn = () => {};
    const liveError = new Error('live reader unavailable too');

    try {
      await expect(
        loadMoodArchiveWithFallback(
          'detail',
          async () => {
            throw new MoodArchiveHttpError(500, 'Internal Server Error', 'mood_detail_failed');
          },
          async () => {
            throw liveError;
          },
        ),
      ).rejects.toBe(liveError);
    } finally {
      console.warn = originalWarn;
    }
  });

  test('a plain unfiltered archive 500 (no exhaustion code) also falls back to the live reader', async () => {
    const originalWarn = console.warn;
    console.warn = () => {};

    try {
      const result = await loadMoodArchiveWithFallback(
        'feed',
        async () => {
          throw new MoodArchiveHttpError(500, 'Internal Server Error', 'mood_repository_unavailable');
        },
        async () => 'live result',
      );

      expect(result).toBe('live result');
    } finally {
      console.warn = originalWarn;
    }
  });
});
