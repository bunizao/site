import { afterEach, describe, expect, test } from 'bun:test';

import { getAllPosts, groupPostsByYear } from '@/features/posts/server/content';

const originalGhostUrl = process.env.PUBLIC_GHOST_URL;
const originalGhostKey = process.env.GHOST_CONTENT_API_KEY;

afterEach(() => {
  process.env.PUBLIC_GHOST_URL = originalGhostUrl;
  process.env.GHOST_CONTENT_API_KEY = originalGhostKey;
});

describe('posts content provider', () => {
  test('returns sorted mock posts when Ghost is unconfigured', async () => {
    delete process.env.PUBLIC_GHOST_URL;
    delete process.env.GHOST_CONTENT_API_KEY;

    const posts = await getAllPosts();

    expect(posts.length).toBeGreaterThan(0);
    expect(posts.map((post) => post.slug).slice(0, 3)).toEqual([
      'demo-effects',
      'quiet-architecture',
      'notes-from-the-links-lab',
    ]);
  });

  test('groups posts by published year in list order', async () => {
    delete process.env.PUBLIC_GHOST_URL;
    delete process.env.GHOST_CONTENT_API_KEY;

    const posts = await getAllPosts();
    const groups = groupPostsByYear([
      { ...posts[0], publishedAt: '2026-04-09T10:30:00.000Z' },
      { ...posts[1], publishedAt: '2025-12-31T23:30:00.000Z' },
      { ...posts[2], publishedAt: '2025-01-01T00:00:00.000Z' },
    ]);

    expect(groups.map((group) => group.year)).toEqual(['2026', '2025']);
    expect(groups[1].posts.map((post) => post.slug)).toEqual([
      'quiet-architecture',
      'notes-from-the-links-lab',
    ]);
  });
});
