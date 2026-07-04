import { describe, expect, test } from 'bun:test';
import { ALL as redirectV2ApiRoute } from '../../src/pages/v2/[...path]';

describe('API route redirects', () => {
  test('redirects direct v2 worker requests through the public API prefix', async () => {
    const response = await redirectV2ApiRoute({
      request: new Request('https://buxx.me/v2/mood/123/comments?before=99'),
      params: {
        path: 'mood/123/comments',
      },
      locals: {},
    } as any);

    expect(response.status).toBe(308);
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0');
    expect(response.headers.get('location')).toBe('https://buxx.me/api/v2/mood/123/comments?before=99');
  });
});
