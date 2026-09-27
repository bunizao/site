import { describe, expect, test } from 'bun:test';
import { readBuildEnvError } from '../../scripts/build-cloudflare.mjs';

const ghostEnv = {
  GHOST_CONTENT_API_KEY: 'test-key',
  PUBLIC_GHOST_URL: 'https://blog.buxx.me',
};

describe('Cloudflare build guard', () => {
  test('accepts blog.buxx.me as the Ghost origin', () => {
    expect(readBuildEnvError(ghostEnv)).toBeNull();
  });

  test('refuses to build without the Ghost URL and Content API key', () => {
    const error = readBuildEnvError({});

    expect(error).toContain('Missing Cloudflare build-time Ghost environment variables');
    expect(error).toContain('- PUBLIC_GHOST_URL');
    expect(error).toContain('- GHOST_CONTENT_API_KEY');
  });

  test('rejects a Ghost origin routed to the site Worker', () => {
    expect(readBuildEnvError({ ...ghostEnv, PUBLIC_GHOST_URL: 'https://buxx.me' }))
      .toContain('PUBLIC_GHOST_URL points at buxx.me');
  });

  test.each(['GHOST_MOCK_CONTENT', 'E2E_SITE_FIXTURE'])(
    'rejects mock content in deployment builds (%s)',
    (flag) => {
      expect(readBuildEnvError({ ...ghostEnv, [flag]: 'true' }))
        .toBe('Mock Ghost content is disabled for Cloudflare builds.');
    },
  );
});
