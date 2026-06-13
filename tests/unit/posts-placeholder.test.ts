import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';

describe('posts placeholder route', () => {
  test('keeps the public posts page flag-gated and disabled by default', async () => {
    const source = await readFile(
      new URL('../../src/pages/posts/index.astro', import.meta.url),
      'utf8',
    );

    expect(source).toContain("readEnv(Astro.locals, 'ENABLE_POSTS_PAGE')");
    expect(source).toContain('export const prerender = false');
    expect(source).toContain('Astro.response.status = 404');
    expect(source).not.toContain('fetchLatestGhostPosts');
    expect(source).not.toContain('GHOST_CONTENT_APIKEY');
  });
});
