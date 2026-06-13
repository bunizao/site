import { describe, expect, test } from 'bun:test';
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
  test('rewrites public API URLs to the private API origin', () => {
    const url = rewriteApiServiceUrl('https://buxx.me/api/health?probe=1');

    expect(url.toString()).toBe('https://site-api.internal/v1/health?probe=1');
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

    expect(proxied.url).toBe('https://site-api.internal/v1/notify/dispatch?dry=1');
    expect(proxied.method).toBe('POST');
    expect(proxied.headers.get('authorization')).toBe('Bearer test');
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
      expect(request.url).toBe('https://site-api.internal/v1/health');
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
