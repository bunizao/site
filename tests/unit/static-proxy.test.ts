import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { mintStaticProxyUrl, type StaticProxyKeyRing } from '../../src/lib/security/static-proxy-signing';
import { GET, HEAD } from '../../src/pages/static/[...path]';

const originalFetch = globalThis.fetch;
const originalConsoleInfo = console.info;
let signatureObservations: unknown[][] = [];
const signingKeyRing: StaticProxyKeyRing = {
  current: { id: '2026-07', secret: 'current-secret' },
};

beforeEach(() => {
  signatureObservations = [];
  console.info = (...args: unknown[]) => signatureObservations.push(args);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  console.info = originalConsoleInfo;
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

  test('proxies only bounded YouTube poster paths without a client-side signature', async () => {
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
      locals: { env: { STATIC_PROXY_MODE: 'enforce' } },
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(fetchedUrl).toBe('https://i.ytimg.com/vi/aqz-KE-bpKQ/maxresdefault.jpg');
    expect(signatureObservations).toEqual([]);
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
      locals: { env: { STATIC_PROXY_MODE: 'enforce' } },
    } as never);
    const response = await GET({
      request: new Request(
        'https://buxx.me/static/youtube/fiX2TMzF1qk/avatar.jpg',
        { headers: { 'CF-Connecting-IP': '192.0.2.35' } },
      ),
      params: { path: 'youtube/fiX2TMzF1qk/avatar.jpg' },
      locals: { env: { STATIC_PROXY_MODE: 'enforce' } },
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
    expect(signatureObservations).toEqual([]);
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
        locals: { env: { STATIC_PROXY_MODE: 'enforce' } },
      } as never);

      expect(response.status, path).toBe(400);
    }

    const queryResponse = await GET({
      request: new Request(
        'https://buxx.me/static/youtube/aqz-KE-bpKQ/hqdefault.jpg?target=other',
        { headers: { 'CF-Connecting-IP': '192.0.2.33' } },
      ),
      params: { path: 'youtube/aqz-KE-bpKQ/hqdefault.jpg' },
      locals: { env: { STATIC_PROXY_MODE: 'enforce' } },
    } as never);

    const arbitraryTargetResponse = await GET({
      request: new Request(
        'https://buxx.me/static/https:/i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg',
        { headers: { 'CF-Connecting-IP': '192.0.2.34' } },
      ),
      params: { path: 'https:/i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg' },
      locals: { env: { STATIC_PROXY_MODE: 'observe' } },
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

  test('accepts a valid signed target without forwarding signature fields upstream', async () => {
    const targetUrl = 'https://cdn4.telegram-cdn.org/image.png?quality=80&format=webp';
    const proxyPath = mintStaticProxyUrl(targetUrl, signingKeyRing);
    let fetchedUrl = '';
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetchedUrl = String(input);
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'Content-Type': 'image/png' },
      });
    }) as typeof fetch;

    const response = await GET({
      request: new Request(`https://buxx.me${proxyPath}`, {
        headers: { 'CF-Connecting-IP': '192.0.2.20' },
      }),
      params: { path: new URL(proxyPath, 'https://buxx.me').pathname.slice('/static/'.length) },
      locals: {
        env: {
          STATIC_PROXY_MODE: 'accept-both',
          STATIC_PROXY_KEY_ID: signingKeyRing.current.id,
          STATIC_PROXY_SECRET: signingKeyRing.current.secret,
        },
      },
    } as never);

    expect(response.status).toBe(200);
    expect(fetchedUrl).toBe(targetUrl);
  });

  test('accept-both mode rejects an explicitly invalid signed request', async () => {
    const proxyUrl = new URL(
      mintStaticProxyUrl('https://cdn4.telegram-cdn.org/image.png', signingKeyRing),
      'https://buxx.me'
    );
    proxyUrl.searchParams.set('s', `A${proxyUrl.searchParams.get('s')?.slice(1)}`);

    const response = await GET({
      request: new Request(proxyUrl, {
        headers: { 'CF-Connecting-IP': '192.0.2.21' },
      }),
      params: { path: proxyUrl.pathname.slice('/static/'.length) },
      locals: {
        env: {
          STATIC_PROXY_MODE: 'accept-both',
          STATIC_PROXY_KEY_ID: signingKeyRing.current.id,
          STATIC_PROXY_SECRET: signingKeyRing.current.secret,
        },
      },
    } as never);

    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  test('observe mode accepts unsigned legacy targets and records only their route family', async () => {
    globalThis.fetch = (async () => new Response(new Uint8Array([1, 2, 3]), {
      headers: { 'Content-Type': 'image/png' },
    })) as unknown as typeof fetch;

    const response = await GET({
      request: new Request(
        'https://buxx.me/static/https:/t.me/private-channel/image.png?width=640',
        { headers: { 'CF-Connecting-IP': '192.0.2.22' } }
      ),
      params: { path: 'https:/t.me/private-channel/image.png' },
      locals: { env: { STATIC_PROXY_MODE: 'observe' } },
    } as never);

    expect(response.status).toBe(200);
    expect(signatureObservations).toEqual([
      [
        'Static proxy signature observation',
        { mode: 'observe', status: 'unsigned', routeFamily: 't.me' },
      ],
    ]);
    expect(JSON.stringify(signatureObservations)).not.toContain('private-channel');
  });

  test('observe mode accepts invalid signatures without logging target details', async () => {
    const targetUrl = 'https://cdn4.telegram-cdn.org/private/image.png?token=sensitive';
    const proxyUrl = new URL(mintStaticProxyUrl(targetUrl, signingKeyRing), 'https://buxx.me');
    const originalSignature = proxyUrl.searchParams.get('s') ?? '';
    proxyUrl.searchParams.set('s', `${originalSignature.startsWith('A') ? 'B' : 'A'}${originalSignature.slice(1)}`);
    let fetchedUrl = '';
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetchedUrl = String(input);
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'Content-Type': 'image/png' },
      });
    }) as typeof fetch;

    const response = await GET({
      request: new Request(proxyUrl, {
        headers: { 'CF-Connecting-IP': '192.0.2.23' },
      }),
      params: { path: proxyUrl.pathname.slice('/static/'.length) },
      locals: {
        env: {
          STATIC_PROXY_MODE: 'observe',
          STATIC_PROXY_KEY_ID: signingKeyRing.current.id,
          STATIC_PROXY_SECRET: signingKeyRing.current.secret,
        },
      },
    } as never);

    expect(response.status).toBe(200);
    expect(fetchedUrl).toBe(targetUrl);
    expect(signatureObservations).toEqual([
      [
        'Static proxy signature observation',
        {
          mode: 'observe',
          status: 'invalid',
          routeFamily: 'cdn4.telegram-cdn.org',
          reason: 'signature',
        },
      ],
    ]);
    expect(JSON.stringify(signatureObservations)).not.toContain('sensitive');
    expect(JSON.stringify(signatureObservations)).not.toContain(originalSignature);
  });

  test('preserves signature-like query names on unsigned legacy targets', async () => {
    let fetchedUrl = '';
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetchedUrl = String(input);
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'Content-Type': 'image/png' },
      });
    }) as typeof fetch;

    const response = await GET({
      request: new Request(
        'https://buxx.me/static/https:/cdn4.telegram-cdn.org/image.png?quality=80&k=target-key&e=1&s=target-signature',
        { headers: { 'CF-Connecting-IP': '192.0.2.27' } }
      ),
      params: { path: 'https:/cdn4.telegram-cdn.org/image.png' },
      locals: { env: { STATIC_PROXY_MODE: 'accept-both' } },
    } as never);

    expect(response.status).toBe(200);
    expect(fetchedUrl).toBe(
      'https://cdn4.telegram-cdn.org/image.png?quality=80&k=target-key&e=1&s=target-signature'
    );
  });

  test('accept-both mode keeps unsigned legacy targets working', async () => {
    globalThis.fetch = (async () => new Response(new Uint8Array([1, 2, 3]), {
      headers: { 'Content-Type': 'image/png' },
    })) as unknown as typeof fetch;

    const response = await GET({
      request: new Request('https://buxx.me/static/https:/cdn4.telegram-cdn.org/image.png', {
        headers: { 'CF-Connecting-IP': '192.0.2.24' },
      }),
      params: { path: 'https:/cdn4.telegram-cdn.org/image.png' },
      locals: { env: { STATIC_PROXY_MODE: 'accept-both' } },
    } as never);

    expect(response.status).toBe(200);
  });

  test('enforce mode accepts valid signatures and rejects unsigned legacy targets', async () => {
    globalThis.fetch = (async () => new Response(new Uint8Array([1, 2, 3]), {
      headers: { 'Content-Type': 'image/png' },
    })) as unknown as typeof fetch;
    const signedPath = mintStaticProxyUrl(
      'https://cdn4.telegram-cdn.org/image.png',
      signingKeyRing
    );
    const signedUrl = new URL(signedPath, 'https://buxx.me');
    const locals = {
      env: {
        STATIC_PROXY_MODE: 'enforce',
        STATIC_PROXY_KEY_ID: signingKeyRing.current.id,
        STATIC_PROXY_SECRET: signingKeyRing.current.secret,
      },
    };

    const signedResponse = await GET({
      request: new Request(signedUrl, {
        headers: { 'CF-Connecting-IP': '192.0.2.25' },
      }),
      params: { path: signedUrl.pathname.slice('/static/'.length) },
      locals,
    } as never);
    const unsignedResponse = await GET({
      request: new Request('https://buxx.me/static/https:/cdn4.telegram-cdn.org/image.png', {
        headers: { 'CF-Connecting-IP': '192.0.2.26' },
      }),
      params: { path: 'https:/cdn4.telegram-cdn.org/image.png' },
      locals,
    } as never);

    expect(signedResponse.status).toBe(200);
    expect(unsignedResponse.status).toBe(403);
    expect(unsignedResponse.headers.get('cache-control')).toBe('no-store');
  });

  test('keeps host and content confinement checks on valid signed targets', async () => {
    const locals = {
      env: {
        STATIC_PROXY_MODE: 'enforce',
        STATIC_PROXY_KEY_ID: signingKeyRing.current.id,
        STATIC_PROXY_SECRET: signingKeyRing.current.secret,
      },
    };
    const forbiddenPath = mintStaticProxyUrl('https://example.com/payload.png', signingKeyRing);
    const forbiddenUrl = new URL(forbiddenPath, 'https://buxx.me');

    const forbiddenResponse = await GET({
      request: new Request(forbiddenUrl, {
        headers: { 'CF-Connecting-IP': '192.0.2.28' },
      }),
      params: { path: forbiddenUrl.pathname.slice('/static/'.length) },
      locals,
    } as never);

    expect(forbiddenResponse.status).toBe(400);

    globalThis.fetch = (async () => new Response('<script>window.pwned = true</script>', {
      headers: { 'Content-Type': 'text/html' },
    })) as unknown as typeof fetch;
    const htmlPath = mintStaticProxyUrl('https://t.me/untrusted-page', signingKeyRing);
    const htmlUrl = new URL(htmlPath, 'https://buxx.me');
    const htmlResponse = await GET({
      request: new Request(htmlUrl, {
        headers: { 'CF-Connecting-IP': '192.0.2.29' },
      }),
      params: { path: htmlUrl.pathname.slice('/static/'.length) },
      locals,
    } as never);

    expect(htmlResponse.status).toBe(415);
    expect(htmlResponse.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
  });

  test('keeps redirect host validation on valid signed targets', async () => {
    const consoleError = spyOn(console, 'error').mockImplementation(() => {});
    globalThis.fetch = (async () => new Response(null, {
      status: 302,
      headers: { Location: 'https://example.com/payload.png' },
    })) as unknown as typeof fetch;
    const proxyPath = mintStaticProxyUrl(
      'https://cdn4.telegram-cdn.org/redirect.png',
      signingKeyRing
    );
    const proxyUrl = new URL(proxyPath, 'https://buxx.me');

    try {
      const response = await GET({
        request: new Request(proxyUrl, {
          headers: { 'CF-Connecting-IP': '192.0.2.30' },
        }),
        params: { path: proxyUrl.pathname.slice('/static/'.length) },
        locals: {
          env: {
            STATIC_PROXY_MODE: 'enforce',
            STATIC_PROXY_KEY_ID: signingKeyRing.current.id,
            STATIC_PROXY_SECRET: signingKeyRing.current.secret,
          },
        },
      } as never);

      expect(response.status).toBe(502);
      expect(response.headers.get('cache-control')).toBe('no-store');
    } finally {
      consoleError.mockRestore();
    }
  });

  test('applies enforce mode to HEAD requests without returning a rejection body', async () => {
    const response = await HEAD({
      request: new Request('https://buxx.me/static/https:/cdn4.telegram-cdn.org/image.png', {
        method: 'HEAD',
        headers: { 'CF-Connecting-IP': '192.0.2.31' },
      }),
      params: { path: 'https:/cdn4.telegram-cdn.org/image.png' },
      locals: { env: { STATIC_PROXY_MODE: 'enforce' } },
    } as never);

    expect(response.status).toBe(403);
    expect(await response.text()).toBe('');
  });
});
