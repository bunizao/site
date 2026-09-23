import { describe, expect, test } from 'bun:test';

import { safeReaderAvatarUrl } from '@/features/comments/reader-avatar';

const hash = 'a'.repeat(64);

describe('safeReaderAvatarUrl', () => {
  test('accepts the exact reader avatar route', () => {
    expect(safeReaderAvatarUrl(`/v2/reader/avatar/${hash}`)).toBe(`/api/v2/reader/avatar/${hash}`);
  });

  test('rejects external, traversal, query, fragment, and malformed paths', () => {
    for (const value of [
      `https://evil.example/v2/reader/avatar/${hash}`,
      '/v2/reader/avatar/../../oauth/reader/github',
      `/v2/reader/avatar/${hash}?s=96`,
      `/v2/reader/avatar/${hash}#x`,
      `/api/v2/reader/avatar/${hash}`,
      '/v2/reader/avatar/not-a-hash',
      '',
    ]) {
      expect(safeReaderAvatarUrl(value)).toBeUndefined();
    }
  });
});
