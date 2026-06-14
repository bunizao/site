import { describe, expect, test } from 'bun:test';
import { loadMoodFeed, loadMoodProbe } from '../../src/features/mood/server/api-client';
import type { ApiServiceBinding } from '../../src/lib/http/api-service-proxy';

function createContext(locals: Record<string, unknown> = {}) {
  return {
    request: new Request('https://buxx.me/mood'),
    locals,
  };
}

function createApiBinding(handler: (request: Request) => Response | Promise<Response>): ApiServiceBinding {
  return {
    fetch: async (input) => handler(input as Request),
  };
}

describe('mood private API client', () => {
  test('requires the API service binding only for explicit v2 reads', async () => {
    try {
      await loadMoodFeed(createContext({
        env: {
          API_BASE_URL: 'https://api.buxx.me/v1/',
        },
      }), { useApiV2: true });
      throw new Error('Expected mood feed loading to fail');
    } catch (error) {
      expect((error as Error).message).toBe('API service binding unavailable');
    }
  });

  test('loads mood data through the API service binding', async () => {
    const api = createApiBinding((request) => {
      expect(request.url).toBe('https://site-api.internal/v1/mood?limit=1');
      expect(request.headers.get('accept')).toBe('application/json');
      expect(request.headers.get('x-forwarded-host')).toBe('buxx.me');

      return Response.json({
        channel: {
          slug: 'tutumood',
          title: 'Mood',
        },
        posts: [],
        pagination: {
          nextCursor: null,
        },
      });
    });

    const feed = await loadMoodFeed(createContext({ env: { API: api } }), { limit: 1, useApiV2: true });

    expect(feed.posts).toEqual([]);
  });

  test('keeps E2E fixture mode independent from the service binding', async () => {
    const probe = await loadMoodProbe(createContext({ env: { E2E_SITE_FIXTURE: '1' } }));

    expect(probe.latestId).toBeTruthy();
  });
});
