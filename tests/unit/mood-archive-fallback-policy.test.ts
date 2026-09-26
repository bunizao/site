import { describe, expect, test } from 'bun:test';
import type { APIContext } from 'astro';

import { moodFeedEndpoints } from '@/features/mood/shared/feed-anchor';
import { GET as getMoodRss } from '../../src/pages/mood/rss.xml';

describe('Mood archive fallback policy', () => {
  test('RSS reads the archive even when the configured read source is live', async () => {
    const paths: string[] = [];
    const api = {
      async fetch(input: RequestInfo | URL) {
        const request = input instanceof Request ? input : new Request(input);
        const url = new URL(request.url);
        paths.push(`${url.pathname}${url.search}`);
        return Response.json({ posts: [], channel: { slug: 'mood', title: 'Mood' } });
      },
    };
    // bun exposes .env files through process.env, which outranks locals.
    const previous = process.env.MOOD_READ_SOURCE;
    process.env.MOOD_READ_SOURCE = 'live';
    try {
      const response = await getMoodRss({
        request: new Request('https://buxx.me/mood/rss.xml'),
        locals: { env: { API: api } },
        site: new URL('https://buxx.me'),
      } as unknown as APIContext);

      expect(response.status).toBe(200);
      expect(paths).toEqual(['/v2/mood?limit=50&fallback=0']);
    } finally {
      if (previous === undefined) delete process.env.MOOD_READ_SOURCE;
      else process.env.MOOD_READ_SOURCE = previous;
    }
  });

  test('tag-filtered client reads never fall back to the live endpoint', () => {
    expect(moodFeedEndpoints('life', 'archive')).toEqual(['/api/v2/mood']);
    expect(moodFeedEndpoints('life', 'live')).toEqual(['/api/v2/mood']);
  });

  test('unfiltered client archive reads degrade to the live endpoint, live reads stay live', () => {
    expect(moodFeedEndpoints('', 'archive')).toEqual(['/api/v2/mood', '/api/moods']);
    expect(moodFeedEndpoints('', 'live')).toEqual(['/api/moods']);
    expect(moodFeedEndpoints('', undefined)).toEqual(['/api/moods']);
  });
});
