import { describe, expect, test } from 'bun:test';

import {
  buildMoodProbeUrl,
  buildMoodRefreshUrl,
  stripMoodRefreshParam,
} from '../../src/features/mood/client/feed-update-watcher';

describe('mood update watcher probe endpoint', () => {
  test('archive source hits the v2 probe without fresh', () => {
    const url = buildMoodProbeUrl('archive');
    expect(url).toBe('/api/v2/mood?probe=1');
    expect(url).not.toContain('fresh');
  });

  test('archive source is case- and whitespace-insensitive', () => {
    expect(buildMoodProbeUrl('  Archive ')).toBe('/api/v2/mood?probe=1');
  });

  test('live source keeps the legacy probe with fresh', () => {
    expect(buildMoodProbeUrl('live')).toBe('/api/moods?probe=1&fresh=1');
  });

  test('missing source defaults to the legacy live probe', () => {
    expect(buildMoodProbeUrl(undefined)).toBe('/api/moods?probe=1&fresh=1');
  });
});

describe('mood update watcher refresh navigation', () => {
  test('adds the newest detected id as an uncacheable refresh marker', () => {
    expect(buildMoodRefreshUrl('https://buxx.me/mood', '1234')).toBe('https://buxx.me/mood?refresh=1234');
  });

  test('keeps existing query parameters and replaces a stale marker', () => {
    expect(buildMoodRefreshUrl('https://buxx.me/mood?lang=en&refresh=1', '1300'))
      .toBe('https://buxx.me/mood?lang=en&refresh=1300');
  });

  test('falls back to a constant marker when no id is pending', () => {
    expect(buildMoodRefreshUrl('https://buxx.me/mood', '')).toBe('https://buxx.me/mood?refresh=1');
  });

  test('strips the marker after render and leaves clean URLs alone', () => {
    expect(stripMoodRefreshParam('https://buxx.me/mood?refresh=1234')).toBe('https://buxx.me/mood');
    expect(stripMoodRefreshParam('https://buxx.me/mood?lang=en&refresh=1234#top'))
      .toBe('https://buxx.me/mood?lang=en#top');
    expect(stripMoodRefreshParam('https://buxx.me/mood')).toBeNull();
  });
});
