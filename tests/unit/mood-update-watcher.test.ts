import { describe, expect, test } from 'bun:test';

import { buildMoodProbeUrl } from '../../src/features/mood/client/feed-update-watcher';

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
