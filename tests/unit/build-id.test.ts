import { describe, expect, test } from 'bun:test';

import { resolveCloudflareBuildId } from '../../scripts/build-id.mjs';

describe('Cloudflare build id', () => {
  test('a fresh build id per build unless PUBLIC_BUILD_ID is pinned', () => {
    expect(resolveCloudflareBuildId({}, 42)).toBe('build-16');
    expect(resolveCloudflareBuildId({}, 43)).toBe('build-17');
    expect(resolveCloudflareBuildId({ PUBLIC_BUILD_ID: ' pinned ' }, 42)).toBe('pinned');
  });

  test('ignores commit SHAs, which Ghost deploy-hook rebuilds share', () => {
    const env = { WORKERS_CI_COMMIT_SHA: 'abc', CF_PAGES_COMMIT_SHA: 'abc', GITHUB_SHA: 'abc' };

    expect(resolveCloudflareBuildId(env, 42)).not.toBe(resolveCloudflareBuildId(env, 43));
  });
});
