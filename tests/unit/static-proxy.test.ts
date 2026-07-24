import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { GET } from '../../src/pages/static/[...path]';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('static Telegram proxy', () => {
  test('keeps cache headers and strips upstream cookies', async () => {
    globalThis.fetch = (async () => new Response('{"emoji":"https://cdn4.telesco.pe/emoji.tgs"}', {
      headers: {
        'Cache-Control': 'public, max-age=3600',
        'Content-Type': 'application/json',
        'Set-Cookie': 'stel_ssid=private; Secure; HttpOnly',
      },
    })) as unknown as typeof fetch;

    const request = new Request('https://buxx.me/static/https:/t.me/i/emoji/123.json', {
      headers: { 'CF-Connecting-IP': '192.0.2.10' },
    });
    const response = await GET({
      request,
      params: { path: 'https:/t.me/i/emoji/123.json' },
      locals: {},
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=3600');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  test('does not cache transient upstream failures', async () => {
    const consoleError = spyOn(console, 'error').mockImplementation(() => {});
    globalThis.fetch = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;

    try {
      const response = await GET({
        request: new Request('https://buxx.me/static/https:/t.me/i/emoji/456.json', {
          headers: { 'CF-Connecting-IP': '192.0.2.11' },
        }),
        params: { path: 'https:/t.me/i/emoji/456.json' },
        locals: {},
      } as never);

      expect(response.status).toBe(502);
      expect(response.headers.get('cache-control')).toBe('no-store');
    } finally {
      consoleError.mockRestore();
    }
  });
});
