import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { getMarkdownRenderer } from '@/features/agent-markdown/server/registry';
import { resetPostsProviderForTests } from '@/features/posts/server/content';

const originalGhostUrl = process.env.PUBLIC_GHOST_URL;
const originalGhostKey = process.env.GHOST_CONTENT_API_KEY;
const originalGhostMockContent = process.env.GHOST_MOCK_CONTENT;

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function useMockGhostContent(): void {
  delete process.env.PUBLIC_GHOST_URL;
  delete process.env.GHOST_CONTENT_API_KEY;
  process.env.GHOST_MOCK_CONTENT = '1';
}

beforeEach(() => {
  resetPostsProviderForTests();
});

afterEach(() => {
  restoreEnv('PUBLIC_GHOST_URL', originalGhostUrl);
  restoreEnv('GHOST_CONTENT_API_KEY', originalGhostKey);
  restoreEnv('GHOST_MOCK_CONTENT', originalGhostMockContent);
  resetPostsProviderForTests();
});

function renderBlogPost(slug: string, assetsFetch: (path: string) => Response) {
  const match = getMarkdownRenderer(`/blog/${slug}`);
  if (!match) throw new Error(`no renderer matched /blog/${slug}`);

  const url = new URL(`https://buxx.me/blog/${slug}`);
  return match.renderer.render({
    request: new Request(url),
    locals: {
      env: {
        ASSETS: {
          fetch: async (input: RequestInfo | URL) => {
            const path = input instanceof Request ? new URL(input.url).pathname : new URL(String(input)).pathname;
            return assetsFetch(path);
          },
        },
      },
    } as unknown as App.Locals,
    url,
    site: new URL('https://buxx.me'),
    params: match.params,
  });
}

describe('agent-markdown blog post build fallback', () => {
  test('returns the built asset directly without touching Ghost', async () => {
    // Ghost is left unconfigured on purpose: reaching it here would be the bug.
    const result = await renderBlogPost('demo-effects', () => new Response('# Built copy\n'));

    expect(result.status).toBe(200);
    expect(result.body).toBe('# Built copy\n');
  });

  test('passes a non-404 build error straight through without touching Ghost', async () => {
    const result = await renderBlogPost('demo-effects', () => new Response(null, { status: 500 }));

    expect(result.status).toBe(500);
  });

  test('falls back to a live Ghost read when a post is missing from both build prefixes', async () => {
    useMockGhostContent();

    // A post published after the last build: neither the listed nor the
    // unlisted build prefix has it, so the previous behavior was a hard 404.
    const result = await renderBlogPost('demo-effects', () => new Response(null, { status: 404 }));

    expect(result.status).toBe(200);
    expect(result.body).toContain('# Astro migration effect sandbox');
  });
});
