import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  createApiServiceRequest,
  getApiServiceBinding,
  proxyApiRequest,
  rewriteApiServiceUrl,
  type ApiServiceBinding,
} from '../../src/lib/http/api-service-proxy';

function createApiBinding(handler: (request: Request) => Response | Promise<Response>): ApiServiceBinding {
  return {
    fetch: async (input) => handler(input as Request),
  };
}

describe('api service proxy', () => {
  test('keeps the legacy login route as an Access handoff', () => {
    const source = readFileSync(new URL('../../src/pages/oauth/login.ts', import.meta.url), 'utf8');

    expect(source).toContain('normalizeNext');
    expect(source).not.toContain('GitHub');
  });

  test('rewrites public API URLs to the private API origin', () => {
    const url = rewriteApiServiceUrl('https://buxx.me/api/health?probe=1');

    expect(url.toString()).toBe('https://site-api.internal/api/health?probe=1');
  });

  test('passes legacy login and private API routes through without version prefixing', () => {
    expect(rewriteApiServiceUrl('https://buxx.me/oauth/login?next=%2Fdocs').toString())
      .toBe('https://site-api.internal/oauth/login?next=%2Fdocs');
    expect(rewriteApiServiceUrl('https://buxx.me/v2/admin/session').toString())
      .toBe('https://site-api.internal/v2/admin/session');
  });

  test('never proxies public dev portal pages into the API worker', () => {
    expect(rewriteApiServiceUrl('https://buxx.me/dev/portal').toString())
      .toBe('https://site-api.internal/v2/dev/portal');
  });

  test('passes method, body, and headers through to the service binding', async () => {
    const request = new Request('https://buxx.me/api/notify/dispatch?dry=1', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ postId: '123' }),
    });
    const proxied = createApiServiceRequest(request);

    expect(proxied.url).toBe('https://site-api.internal/api/notify/dispatch?dry=1');
    expect(proxied.method).toBe('POST');
    expect(proxied.headers.get('authorization')).toBe('Bearer test');
    expect(proxied.headers.get('x-forwarded-host')).toBe('buxx.me');
    expect(proxied.headers.get('x-forwarded-proto')).toBe('https');
    expect(proxied.headers.get('x-forwarded-origin')).toBe('https://buxx.me');
    expect(proxied.headers.get('x-buxx-forwarded-url')).toBe('https://buxx.me/api/notify/dispatch?dry=1');
    expect(await proxied.json()).toEqual({ postId: '123' });
  });

  test('returns 503 when the API service binding is unavailable', async () => {
    const response = await proxyApiRequest(new Request('https://buxx.me/api/health'), { env: {} });
    const body = await response.json() as { error?: string };

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0');
    expect(body.error).toBe('API service binding unavailable');
  });

  test('preserves service response status and cache headers', async () => {
    const api = createApiBinding((request) => {
      expect(request.url).toBe('https://site-api.internal/api/health');
      return new Response(JSON.stringify({ status: 'ok', service: 'site-api' }), {
        status: 203,
        statusText: 'Non-Authoritative Information',
        headers: {
          'Cache-Control': 'public, max-age=30',
          ETag: '"abc"',
          'Content-Type': 'application/json',
        },
      });
    });

    const response = await proxyApiRequest(new Request('https://buxx.me/api/health'), {
      env: { API: api },
    });

    expect(response.status).toBe(203);
    expect(response.statusText).toBe('Non-Authoritative Information');
    expect(response.headers.get('cache-control')).toBe('public, max-age=30');
    expect(response.headers.get('etag')).toBe('"abc"');
    expect(await response.json()).toEqual({ status: 'ok', service: 'site-api' });
  });

  test('removes browser compression negotiation from dev HTTP proxy requests', async () => {
    const originalFetch = globalThis.fetch;
    const originalDev = process.env.DEV;
    const originalApiDevOrigin = process.env.API_DEV_ORIGIN;
    let upstreamAcceptEncoding: string | null = null;

    process.env.DEV = 'true';
    process.env.API_DEV_ORIGIN = 'https://api.example';
    globalThis.fetch = (async (input) => {
      const request = input instanceof Request ? input : new Request(input);
      upstreamAcceptEncoding = request.headers.get('accept-encoding');
      return Response.json({ results: [{ id: '3675' }] }, {
        headers: {
          'Content-Encoding': 'zstd',
          'Content-Length': '42',
        },
      });
    }) as typeof fetch;

    try {
      const response = await proxyApiRequest(new Request(
        'http://localhost:4321/api/v2/mood/search?q=MU',
        { headers: { 'Accept-Encoding': 'gzip, deflate, br, zstd' } },
      ), { env: {} });

      expect(upstreamAcceptEncoding).toBeNull();
      expect(response.headers.get('content-encoding')).toBeNull();
      expect(response.headers.get('content-length')).toBeNull();
      expect(await response.json()).toEqual({ results: [{ id: '3675' }] });
    } finally {
      globalThis.fetch = originalFetch;
      if (originalDev === undefined) delete process.env.DEV;
      else process.env.DEV = originalDev;
      if (originalApiDevOrigin === undefined) delete process.env.API_DEV_ORIGIN;
      else process.env.API_DEV_ORIGIN = originalApiDevOrigin;
    }
  });

  test('falls back to runtime env when direct locals env lacks the binding', async () => {
    const api = createApiBinding(() => new Response('ok'));
    const response = await proxyApiRequest(new Request('https://buxx.me/api/health'), {
      env: {},
      runtime: {
        env: { API: api },
      },
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
  });

  test('falls back to the Cloudflare Workers env binding', async () => {
    const api = createApiBinding(() => new Response('ok'));
    const binding = await getApiServiceBinding({ env: {} }, async () => ({ API: api }));

    expect(binding).toBe(api);
  });
});
