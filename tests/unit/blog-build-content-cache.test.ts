import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { mockPosts } from '@/features/posts/adapter/mock';
import {
  getAccessiblePosts,
  getListedPosts,
  getPostBySlug,
  resetPostsProviderForTests,
} from '@/features/posts/server/content';

// ST-7: dropping `{ outputTarget: 'web' | 'rss' }` from the metadata-only call
// sites (blog index, tag archive, i18n manifest, RSS) is only safe as long as
// `getListedPosts`/`getAccessiblePosts`/`getPostBySlug` truly skip the Ghost
// directive/HTML pipeline without an `outputTarget`, and the per-post
// memoization added alongside it (a `Map` keyed by `${post.id}:${outputTarget}`)
// actually collapses repeat transforms of the same post instead of silently
// doing nothing. This file locks both invariants down.

const originalGhostUrl = process.env.PUBLIC_GHOST_URL;
const originalGhostKey = process.env.GHOST_CONTENT_API_KEY;
const originalLegacyGhostKey = process.env.GHOST_CONTENT_APIKEY;
const originalGhostMockContent = process.env.GHOST_MOCK_CONTENT;

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

function useMockGhostContent(): void {
  delete process.env.PUBLIC_GHOST_URL;
  delete process.env.GHOST_CONTENT_API_KEY;
  delete process.env.GHOST_CONTENT_APIKEY;
  process.env.GHOST_MOCK_CONTENT = '1';
}

beforeEach(() => {
  resetPostsProviderForTests();
});

afterEach(() => {
  restoreEnv('PUBLIC_GHOST_URL', originalGhostUrl);
  restoreEnv('GHOST_CONTENT_API_KEY', originalGhostKey);
  restoreEnv('GHOST_CONTENT_APIKEY', originalLegacyGhostKey);
  restoreEnv('GHOST_MOCK_CONTENT', originalGhostMockContent);
  resetPostsProviderForTests();
});

describe('blog build content cache', () => {
  test('skips the rich-content transform without an outputTarget', async () => {
    useMockGhostContent();

    const [listed, accessible, bySlug] = await Promise.all([
      getListedPosts(),
      getAccessiblePosts(),
      getPostBySlug('demo-effects'),
    ]);

    for (const post of [...listed, ...accessible, bySlug!]) {
      expect(post.directiveMeta).toBeUndefined();
    }
  });

  test('memoizes a prepared post across repeated calls with the same outputTarget', async () => {
    useMockGhostContent();

    const first = await getPostBySlug('demo-effects', { outputTarget: 'web' });
    const second = await getPostBySlug('demo-effects', { outputTarget: 'web' });

    expect(first).not.toBeNull();
    // Identity, not just equality: the second call must serve the cached
    // object rather than re-running the directive/HTML pipeline.
    expect(second).toBe(first);
  });

  test('keeps distinct outputTargets separate in the cache', async () => {
    useMockGhostContent();

    const raw = await getPostBySlug('demo-effects');
    const web = await getPostBySlug('demo-effects', { outputTarget: 'web' });

    expect(raw).not.toBeNull();
    expect(web).not.toBeNull();
    expect(web).not.toBe(raw);
    expect(web?.directiveMeta).toBeDefined();
    expect(raw?.directiveMeta).toBeUndefined();
  });

  test('shares the cached transform between getListedPosts and getAccessiblePosts', async () => {
    useMockGhostContent();

    // Mirrors generate-agent-markdown.ts's own call shape: listed posts are a
    // subset of accessible posts, so the overlap must not be transformed twice.
    const [listed, accessible] = await Promise.all([
      getListedPosts({ outputTarget: 'agent-markdown' }),
      getAccessiblePosts({ outputTarget: 'agent-markdown' }),
    ]);
    const fromListed = listed.find((post) => post.slug === 'demo-effects');
    const fromAccessible = accessible.find((post) => post.slug === 'demo-effects');

    expect(fromListed).toBeDefined();
    expect(fromAccessible).toBe(fromListed);
  });

  test('drops cached posts when the provider is reset, so stale fixtures cannot leak', async () => {
    useMockGhostContent();
    const record = mockPosts.find((post) => post.slug === 'demo-effects');
    expect(record).toBeDefined();
    if (!record) return;
    const originalHtml = record.html;

    try {
      const before = await getPostBySlug('demo-effects');
      expect(before?.html).toBe(originalHtml);

      record.html = '<p>Swapped fixture body.</p>';
      resetPostsProviderForTests();

      const after = await getPostBySlug('demo-effects');
      expect(after?.html).toBe('<p>Swapped fixture body.</p>');
    } finally {
      record.html = originalHtml;
      resetPostsProviderForTests();
    }
  });
});
