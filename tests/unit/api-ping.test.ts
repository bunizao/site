import { describe, expect, test } from 'bun:test';
import { GET, HEAD } from '../../src/pages/api/ping';

function createRequest(method: string): Request {
  return new Request('https://buxx.me/api/ping', { method });
}

describe('api ping', () => {
  test('returns a tiny uncached success response for uptime monitors', async () => {
    const response = await GET({
      request: createRequest('GET'),
      locals: {},
    } as any);

    expect(response.status).toBe(204);
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0');
    expect(await response.text()).toBe('');
  });

  test('handles HEAD without invoking heavier health checks', async () => {
    const response = await HEAD({
      request: createRequest('HEAD'),
      locals: {},
    } as any);

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
  });
});
