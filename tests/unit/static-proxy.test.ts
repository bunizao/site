import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { GET, HEAD } from '../../src/pages/static/[...path]';

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
    expect(response.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
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

  test('proxies only bounded YouTube poster paths', async () => {
    let fetchedUrl = '';
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetchedUrl = String(input);
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'Content-Type': 'image/jpeg' },
      });
    }) as typeof fetch;

    const response = await GET({
      request: new Request(
        'https://buxx.me/static/youtube/aqz-KE-bpKQ/maxresdefault.jpg',
        { headers: { 'CF-Connecting-IP': '192.0.2.31' } },
      ),
      params: { path: 'youtube/aqz-KE-bpKQ/maxresdefault.jpg' },
      locals: {},
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(fetchedUrl).toBe('https://i.ytimg.com/vi/aqz-KE-bpKQ/maxresdefault.jpg');
  });

  test('resolves and proxies bounded YouTube channel avatars', async () => {
    const fetchedUrls: string[] = [];
    const redirectModes: Array<RequestRedirect | undefined> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      fetchedUrls.push(url);
      redirectModes.push(init?.redirect);

      if (url.startsWith('https://www.youtube.com/oembed?')) {
        return Response.json({
          title: 'MacBook Pro review',
          author_name: 'Zhong Wen Ze',
          author_url: 'https://www.youtube.com/@zhongwenze',
        });
      }
      if (url === 'https://www.youtube.com/@zhongwenze') {
        return new Response(
          '<meta property="og:image" content="https://yt3.googleusercontent.com/channel-avatar=s900-c-k-c0x00ffffff-no-rj">',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
        );
      }
      if (url === 'https://yt3.googleusercontent.com/channel-avatar=s128-c-k-c0x00ffffff-no-rj') {
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: { 'Content-Type': 'image/jpeg' },
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    const metadataResponse = await GET({
      request: new Request(
        'https://buxx.me/static/youtube/fiX2TMzF1qk/metadata.json',
        { headers: { 'CF-Connecting-IP': '192.0.2.35' } },
      ),
      params: { path: 'youtube/fiX2TMzF1qk/metadata.json' },
      locals: {},
    } as never);
    const response = await GET({
      request: new Request(
        'https://buxx.me/static/youtube/fiX2TMzF1qk/avatar.jpg',
        { headers: { 'CF-Connecting-IP': '192.0.2.35' } },
      ),
      params: { path: 'youtube/fiX2TMzF1qk/avatar.jpg' },
      locals: {},
    } as never);

    expect(metadataResponse.status).toBe(200);
    expect(await metadataResponse.json()).toMatchObject({
      channelName: 'Zhong Wen Ze',
      channelUrl: 'https://www.youtube.com/@zhongwenze',
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(fetchedUrls).toEqual([
      'https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DfiX2TMzF1qk&format=json',
      'https://www.youtube.com/@zhongwenze',
      'https://yt3.googleusercontent.com/channel-avatar=s128-c-k-c0x00ffffff-no-rj',
    ]);
    expect(redirectModes).toEqual(['manual', 'manual', 'manual']);
  });

  test('rejects malformed YouTube poster paths before the upstream fetch', async () => {
    let fetchCount = 0;
    globalThis.fetch = Object.assign(
      async () => {
        fetchCount += 1;
        return new Response(new Uint8Array([1]), {
          headers: { 'Content-Type': 'image/jpeg' },
        });
      },
      { preconnect: originalFetch.preconnect },
    );

    for (const path of [
      'youtube/too-short/maxresdefault.jpg',
      'youtube/aqz-KE-bpKQ/sddefault.jpg',
      'youtube/aqz-KE-bpKQ/maxresdefault.jpg/extra',
    ]) {
      const response = await GET({
        request: new Request(`https://buxx.me/static/${path}`, {
          headers: { 'CF-Connecting-IP': '192.0.2.32' },
        }),
        params: { path },
        locals: {},
      } as never);

      expect(response.status, path).toBe(400);
    }

    const queryResponse = await GET({
      request: new Request(
        'https://buxx.me/static/youtube/aqz-KE-bpKQ/hqdefault.jpg?target=other',
        { headers: { 'CF-Connecting-IP': '192.0.2.33' } },
      ),
      params: { path: 'youtube/aqz-KE-bpKQ/hqdefault.jpg' },
      locals: {},
    } as never);

    const arbitraryTargetResponse = await GET({
      request: new Request(
        'https://buxx.me/static/https:/i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg',
        { headers: { 'CF-Connecting-IP': '192.0.2.34' } },
      ),
      params: { path: 'https:/i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg' },
      locals: {},
    } as never);

    expect(queryResponse.status).toBe(400);
    expect(arbitraryTargetResponse.status).toBe(400);
    expect(fetchCount).toBe(0);
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

  test('forwards the request query to the upstream target', async () => {
    let fetchedUrl = '';
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetchedUrl = String(input);
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'Content-Type': 'image/png' },
      });
    }) as typeof fetch;

    const response = await GET({
      request: new Request(
        'https://buxx.me/static/https:/cdn4.telegram-cdn.org/image.png?quality=80&format=webp',
        { headers: { 'CF-Connecting-IP': '192.0.2.27' } }
      ),
      params: { path: 'https:/cdn4.telegram-cdn.org/image.png' },
      locals: {},
    } as never);

    expect(response.status).toBe(200);
    expect(fetchedUrl).toBe('https://cdn4.telegram-cdn.org/image.png?quality=80&format=webp');
  });
});

describe('static proxy host allowlist', () => {
  const hdLocals = { env: { PUBLIC_HD_IMAGE_URL: 'https://buxx.me/api/v2/images' } };

  async function proxy(target: string, ip: string, locals: unknown = hdLocals): Promise<Response> {
    const path = target.replace('://', ':/');
    return GET({
      request: new Request(`https://buxx.me/static/${path}`, {
        headers: { 'CF-Connecting-IP': ip },
      }),
      params: { path },
      locals,
    } as never);
  }

  function recordFetches(response: () => Response): string[] {
    const fetched: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetched.push(String(input));
      return response();
    }) as typeof fetch;
    return fetched;
  }

  const image = () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/png' } });

  test('refuses a host outside the allowlist without fetching it', async () => {
    const fetched = recordFetches(image);

    const response = await proxy('https://example.com/payload.png', '192.0.2.40');

    expect(response.status).toBe(400);
    expect(fetched).toEqual([]);
  });

  test('admits the HD image host exactly but never its sibling subdomains', async () => {
    const fetched = recordFetches(image);

    expect((await proxy('https://buxx.me/api/v2/images/mood/1/0', '192.0.2.41')).status).toBe(200);
    expect((await proxy('https://admin.buxx.me/payload.png', '192.0.2.41')).status).toBe(400);
    expect((await proxy('https://api.buxx.me/payload.png', '192.0.2.41')).status).toBe(400);
    expect(fetched).toEqual(['https://buxx.me/api/v2/images/mood/1/0']);
  });

  test('keeps the legacy image host and Telegram CDN subdomains reachable', async () => {
    const fetched = recordFetches(image);

    expect((await proxy('https://image.buxx.me/mood/3092/0', '192.0.2.42', {})).status).toBe(200);
    expect((await proxy('https://cdn5.telesco.pe/file/photo.jpg', '192.0.2.42', {})).status).toBe(200);
    expect(fetched).toEqual([
      'https://image.buxx.me/mood/3092/0',
      'https://cdn5.telesco.pe/file/photo.jpg',
    ]);
  });

  test('HEAD refuses a host outside the allowlist without a body or a fetch', async () => {
    const fetched = recordFetches(image);

    const response = await HEAD({
      request: new Request('https://buxx.me/static/https:/example.com/payload.png', {
        method: 'HEAD',
        headers: { 'CF-Connecting-IP': '192.0.2.44' },
      }),
      params: { path: 'https:/example.com/payload.png' },
      locals: hdLocals,
    } as never);

    expect(response.status).toBe(400);
    expect(await response.text()).toBe('');
    expect(fetched).toEqual([]);
  });

  test('re-validates every redirect hop against the allowlist', async () => {
    const consoleError = spyOn(console, 'error').mockImplementation(() => {});
    const fetched = recordFetches(() => new Response(null, {
      status: 302,
      headers: { Location: 'https://example.com/payload.png' },
    }));

    try {
      const response = await proxy('https://cdn4.telegram-cdn.org/redirect.png', '192.0.2.43');

      expect(response.status).toBe(502);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(fetched).toEqual(['https://cdn4.telegram-cdn.org/redirect.png']);
    } finally {
      consoleError.mockRestore();
    }
  });
});
