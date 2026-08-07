import { describe, expect, test } from 'bun:test';

import { resolveCloudflareBuildId } from '../../scripts/build-id.mjs';

describe('Cloudflare build id', () => {
  test('uses the deployment revision when the build platform provides one', () => {
    expect(resolveCloudflareBuildId({ CF_PAGES_COMMIT_SHA: 'commit-123' }, 42)).toBe('commit-123');
    expect(resolveCloudflareBuildId({ GITHUB_SHA: 'github-456' }, 42)).toBe('github-456');
  });

  test('creates a new cache namespace for manual production builds', () => {
    expect(resolveCloudflareBuildId({}, 42)).toBe('build-16');
    expect(resolveCloudflareBuildId({}, 43)).toBe('build-17');
  });
});
