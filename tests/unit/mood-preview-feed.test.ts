import { describe, expect, test } from 'bun:test';

import {
  buildMoodPreviewFeedUrls,
  fetchMoodPreviewPosts,
  getSharedMoodPreviewPosts,
  HOME_MOOD_PREVIEW_LIMIT,
  resetSharedMoodPreviewPosts,
} from '../../src/features/mood/client/preview-feed';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('mood preview feed', () => {
  test('prefers the archive route with a bounded limit, then the live mirror', () => {
    expect(buildMoodPreviewFeedUrls(5)).toEqual(['/api/v2/mood?limit=5', '/api/moods']);
  });

  test('reads the archive and never touches the live mirror on success', async () => {
    const calls: string[] = [];
    const posts = await fetchMoodPreviewPosts<{ id: string }>(2, async (url: string) => {
      calls.push(url);
      return jsonResponse({ posts: [{ id: '3' }, { id: '2' }, { id: '1' }] });
    });

    expect(calls).toEqual(['/api/v2/mood?limit=2']);
    expect(posts.map((post) => post.id)).toEqual(['3', '2']);
  });

  test('retries once against the live mirror when the archive fails', async () => {
    const calls: string[] = [];
    const posts = await fetchMoodPreviewPosts<{ id: string }>(3, async (url: string) => {
      calls.push(url);
      return url.startsWith('/api/v2/')
        ? jsonResponse({ error: 'down' }, 503)
        : jsonResponse({ posts: [{ id: '9' }] });
    });

    expect(calls).toEqual(['/api/v2/mood?limit=3', '/api/moods']);
    expect(posts.map((post) => post.id)).toEqual(['9']);
  });

  test('throws when both sources fail', async () => {
    await expect(fetchMoodPreviewPosts(3, async () => {
      throw new Error('offline');
    })).rejects.toThrow('offline');
  });

  test('returns an empty list for a payload without posts', async () => {
    const posts = await fetchMoodPreviewPosts(3, async () => jsonResponse({}));
    expect(posts).toEqual([]);
  });

  describe('shared request', () => {
    test('home previews share one request and each get their own copy', async () => {
      resetSharedMoodPreviewPosts();
      const calls: string[] = [];
      const fetchImpl = async (url: string) => {
        calls.push(url);
        return jsonResponse({ posts: [{ id: '3' }, { id: '2' }, { id: '1' }] });
      };

      const [first, second] = await Promise.all([
        getSharedMoodPreviewPosts<{ id: string }>(HOME_MOOD_PREVIEW_LIMIT, fetchImpl),
        getSharedMoodPreviewPosts<{ id: string }>(HOME_MOOD_PREVIEW_LIMIT, fetchImpl),
      ]);
      first.reverse();
      const later = await getSharedMoodPreviewPosts<{ id: string }>(HOME_MOOD_PREVIEW_LIMIT, fetchImpl);

      expect(calls).toEqual([`/api/v2/mood?limit=${HOME_MOOD_PREVIEW_LIMIT}`]);
      expect(second.map((post) => post.id)).toEqual(['3', '2', '1']);
      expect(later.map((post) => post.id)).toEqual(['3', '2', '1']);
    });

    test('a failed shared request is forgotten so the next caller retries', async () => {
      resetSharedMoodPreviewPosts();
      let attempts = 0;
      const fetchImpl = async () => {
        attempts += 1;
        return attempts <= 2 ? jsonResponse({}, 503) : jsonResponse({ posts: [{ id: '1' }] });
      };

      await expect(getSharedMoodPreviewPosts(5, fetchImpl)).rejects.toThrow('503');
      const posts = await getSharedMoodPreviewPosts<{ id: string }>(5, fetchImpl);

      expect(posts.map((post) => post.id)).toEqual(['1']);
      expect(attempts).toBe(3);
    });
  });
});
