import { describe, expect, test } from 'bun:test';
import { ALL } from '../../src/pages/dev/portal/api/[...path]';
import type { ApiServiceBinding } from '../../src/lib/http/api-service-proxy';

function createApiBinding(handler: (request: Request) => Response | Promise<Response>): ApiServiceBinding {
  return {
    fetch: async (input) => handler(input as Request),
  };
}

describe('portal admin API proxy', () => {
  test('proxies protected portal admin requests through the API service binding', async () => {
    const requests: Request[] = [];
    const api = createApiBinding((request) => {
      requests.push(request);
      return Response.json({ rows: [], total: 0 });
    });

    const response = await ALL({
      request: new Request('https://buxx.me/dev/portal/api/admin/subscribers?limit=100', {
        headers: {
          'cf-access-jwt-assertion': 'access.jwt.test',
        },
      }),
      params: { path: 'admin/subscribers' },
      locals: { env: { API: api } },
    } as never);

    expect(response.status).toBe(200);
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('https://site-api.internal/api/admin/subscribers?limit=100');
    expect(requests[0].headers.get('cf-access-jwt-assertion')).toBe('access.jwt.test');
    expect(requests[0].headers.get('x-forwarded-host')).toBe('buxx.me');
    expect(await response.json()).toEqual({ rows: [], total: 0 });
  });

  test('rejects dot segments that would resolve outside the admin prefix', async () => {
    let called = false;
    const api = createApiBinding(() => {
      called = true;
      return Response.json({});
    });

    for (const path of ['admin/../../v2/mood/feed', 'admin/./../v2', 'admin/subscribers/..']) {
      const response = await ALL({
        request: new Request(`https://buxx.me/dev/portal/api/${path}`),
        params: { path },
        locals: { env: { API: api } },
      } as never);

      expect(response.status).toBe(404);
    }

    expect(called).toBe(false);
  });

  test('rejects non-admin portal API paths', async () => {
    let called = false;
    const api = createApiBinding(() => {
      called = true;
      return Response.json({});
    });

    const response = await ALL({
      request: new Request('https://buxx.me/dev/portal/api/health'),
      params: { path: 'health' },
      locals: { env: { API: api } },
    } as never);

    expect(response.status).toBe(404);
    expect(called).toBe(false);
  });
});
