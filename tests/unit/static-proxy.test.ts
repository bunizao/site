import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { GET } from '../../src/pages/static/[...path]';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('static Telegram proxy', () => {
  test('rejects upstream HTML without exposing or caching its body', async () => {
    globalThis.fetch = (async () => new Response('<script>window.pwned = true</script>', {
      headers: {
        'Cache-Control': 'public, max-age=3600',
        'Content-Type': 'text/html; charset=utf-8',
      },
    })) as unknown as typeof fetch;

    const response = await GET({
      request: new Request('https://buxx.me/static/https:/t.me/untrusted-page', {
        headers: { 'CF-Connecting-IP': '192.0.2.12' },
      }),
      params: { path: 'https:/t.me/untrusted-page' },
      locals: {},
    } as never);

    expect(response.status).toBe(415);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe('');
  });

  test('rejects executable upstream asset types', async () => {
    for (const [contentType, path] of [
      ['image/svg+xml', 'payload.svg'],
      ['text/javascript', 'payload.js'],
    ] as const) {
      globalThis.fetch = (async () => new Response('executable payload', {
        headers: { 'Content-Type': contentType },
      })) as unknown as typeof fetch;

      const response = await GET({
        request: new Request(`https://buxx.me/static/https:/t.me/${path}`, {
          headers: { 'CF-Connecting-IP': '192.0.2.13' },
        }),
        params: { path: `https:/t.me/${path}` },
        locals: {},
      } as never);

      expect(response.status).toBe(415);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.text()).toBe('');
    }
  });

  test('rejects upstream content outside the asset media policy', async () => {
    for (const [contentType, path] of [
      ['text/plain', 'notes.txt'],
      ['application/pdf', 'document.pdf'],
      ['application/wasm', 'module.wasm'],
    ] as const) {
      globalThis.fetch = (async () => new Response('unsupported payload', {
        headers: { 'Content-Type': contentType },
      })) as unknown as typeof fetch;

      const response = await GET({
        request: new Request(`https://buxx.me/static/https:/t.me/${path}`, {
          headers: { 'CF-Connecting-IP': '192.0.2.14' },
        }),
        params: { path: `https:/t.me/${path}` },
        locals: {},
      } as never);

      expect(response.status).toBe(415);
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
  });

  test('rejects JSON outside the exact Telegram animated emoji metadata endpoint', async () => {
    for (const [requestUrl, path] of [
      ['https://buxx.me/static/https:/t.me/untrusted.json', 'https:/t.me/untrusted.json'],
      [
        'https://buxx.me/static/https:/t.me/i/emoji/123.json?format=other',
        'https:/t.me/i/emoji/123.json',
      ],
      [
        'https://buxx.me/static/http:/t.me/i/emoji/123.json',
        'http:/t.me/i/emoji/123.json',
      ],
    ] as const) {
      globalThis.fetch = (async () => new Response('{"value":"untrusted"}', {
        headers: { 'Content-Type': 'application/json' },
      })) as unknown as typeof fetch;

      const response = await GET({
        request: new Request(requestUrl, {
          headers: { 'CF-Connecting-IP': '192.0.2.15' },
        }),
        params: { path },
        locals: {},
      } as never);

      expect(response.status).toBe(415);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.text()).toBe('');
    }
  });

  test('sanitizes allowed image responses and applies browser confinement headers', async () => {
    globalThis.fetch = (async () => new Response(new Uint8Array([1, 2, 3]), {
      headers: { 'Content-Type': 'IMAGE/PNG; charset=untrusted' },
    })) as unknown as typeof fetch;

    const response = await GET({
      request: new Request('https://buxx.me/static/https:/cdn4.telegram-cdn.org/image.png', {
        headers: { 'CF-Connecting-IP': '192.0.2.16' },
      }),
      params: { path: 'https:/cdn4.telegram-cdn.org/image.png' },
      locals: {},
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('content-disposition')).toBe('inline');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
  });

  test('allows binary, font, audio, and video asset responses', async () => {
    for (const [contentType, path] of [
      ['application/octet-stream', 'animation.tgs'],
      ['font/woff2', 'typeface.woff2'],
      ['audio/mpeg', 'audio.mp3'],
      ['video/mp4', 'video.mp4'],
    ] as const) {
      globalThis.fetch = (async () => new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'Content-Type': contentType },
      })) as unknown as typeof fetch;

      const response = await GET({
        request: new Request(`https://buxx.me/static/https:/cdn4.telegram-cdn.org/${path}`, {
          headers: { 'CF-Connecting-IP': '192.0.2.17' },
        }),
        params: { path: `https:/cdn4.telegram-cdn.org/${path}` },
        locals: {},
      } as never);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe(contentType);
    }
  });

  test('allows animated emoji metadata while keeping cache headers and stripping cookies', async () => {
    globalThis.fetch = (async () => new Response('{"emoji":"https://cdn4.telesco.pe/emoji.tgs"}', {
      headers: {
        'Cache-Control': 'public, max-age=3600',
        'Content-Type': 'Application/JSON; charset=utf-8',
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
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(response.headers.get('cache-control')).toBe('public, max-age=3600');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(await response.json()).toEqual({ emoji: 'https://cdn4.telesco.pe/emoji.tgs' });
  });

  test('does not cache non-success responses with an allowed asset type', async () => {
    globalThis.fetch = (async () => new Response(new Uint8Array([1, 2, 3]), {
      status: 404,
      headers: {
        'Cache-Control': 'public, max-age=3600',
        'Content-Type': 'image/png',
      },
    })) as unknown as typeof fetch;

    const response = await GET({
      request: new Request('https://buxx.me/static/https:/cdn4.telegram-cdn.org/missing.png', {
        headers: { 'CF-Connecting-IP': '192.0.2.18' },
      }),
      params: { path: 'https:/cdn4.telegram-cdn.org/missing.png' },
      locals: {},
    } as never);

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  test('does not forward conditional validators that can produce untyped 304 responses', async () => {
    let upstreamHeaders = new Headers();
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      upstreamHeaders = new Headers(init?.headers);
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'Content-Type': 'image/png' },
      });
    }) as typeof fetch;

    const response = await GET({
      request: new Request('https://buxx.me/static/https:/cdn4.telegram-cdn.org/image.png', {
        headers: {
          'CF-Connecting-IP': '192.0.2.19',
          'If-Modified-Since': 'Wed, 21 Oct 2015 07:28:00 GMT',
          'If-None-Match': '"asset-etag"',
        },
      }),
      params: { path: 'https:/cdn4.telegram-cdn.org/image.png' },
      locals: {},
    } as never);

    expect(response.status).toBe(200);
    expect(upstreamHeaders.get('if-modified-since')).toBeNull();
    expect(upstreamHeaders.get('if-none-match')).toBeNull();
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
