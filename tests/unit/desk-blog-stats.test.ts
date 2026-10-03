import { describe, expect, test } from 'bun:test';
import type { BlogStats } from '@bunizao/contracts/content';
import { loadDeskBlogStats, summariseDeskWriting } from '@/features/desk/server/content';

const posts = [
  { slug: 'first', title: 'First', publishedAt: '2025-01-01T00:00:00Z', plaintext: 'One two' },
  { slug: 'second', title: 'Second', publishedAt: '2026-01-01T00:00:00Z', plaintext: 'Three four' },
] as Parameters<typeof summariseDeskWriting>[0];

const stats: BlogStats = {
  generatedAt: '2026-10-04T00:00:00Z',
  since: '2026-06-28T09:14:00Z',
  totals: { reads: 50, readers: 12, completed: 4 },
  posts: [
    { slug: 'removed', reads: 35, completed: 3, medianDwellMs: 100 },
    { slug: 'second', reads: 15, completed: 1, medianDwellMs: 50 },
  ],
};

describe('desk blog statistics', () => {
  test('keeps the writing ledger without a snapshot or counting start', () => {
    for (const snapshot of [null, { ...stats, since: null }]) {
      const writing = summariseDeskWriting(posts, snapshot);
      expect(writing).toEqual({ posts: 2, words: 4, since: 2025 });
    }
  });

  test('uses snapshot totals and joins only listed post slugs', () => {
    const writing = summariseDeskWriting(posts, stats);
    expect(writing?.reads).toEqual({ count: 50, since: 'June 2026' });
    expect(writing?.top?.title).toBe('Second');
    expect(summariseDeskWriting([], stats)).toBeNull();
  });

  test('hides an invalid counting date and does not invent a top post', () => {
    expect(summariseDeskWriting(posts, { ...stats, since: 'invalid' })?.reads).toBeUndefined();
    expect(summariseDeskWriting(posts, { ...stats, posts: [] })?.top).toBeUndefined();
  });

  test('reads through the service binding without forwarding browser identity', async () => {
    let request: Request | undefined;
    const snapshot = await loadDeskBlogStats({
      request: new Request('https://buxx.me/new', { headers: { cookie: 'private=value' } }),
      locals: { env: { API: { fetch: async (input: Request) => {
        request = input;
        return Response.json(stats);
      } } } },
    });
    expect(snapshot).toEqual(stats);
    expect(request?.url).toBe('https://site-api.internal/api/v2/blog/stats');
    expect(request?.headers.has('cookie')).toBe(false);
  });

  test('an absent or malformed snapshot does not fail the desk', async () => {
    for (const response of [new Response('', { status: 503 }), Response.json({}),
      Response.json({ ...stats, posts: [null] }), new Response('broken')]) {
      expect(await loadDeskBlogStats({
        request: new Request('https://buxx.me/new'),
        locals: { env: { API: { fetch: async () => response } } },
      })).toBeNull();
    }
  });
});
