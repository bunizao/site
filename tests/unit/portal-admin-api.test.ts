import { describe, expect, test } from 'bun:test';
import { ALL } from '../../src/pages/dev/portal/api/[...path]';
import { POST as approveCvAccess } from '../../src/pages/dev/portal/cv/api/requests/[id]/approve';
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

  test('forwards CV approval mutations through the portal server client', async () => {
    const requests: Request[] = [];
    const api = createApiBinding((request) => {
      requests.push(request);
      return Response.json({
        request: {
          id: 'request-1',
          email: 'reader@example.test',
          intent: 'Hiring conversation',
          lang: 'en',
          status: 'approved',
          createdAt: '2026-07-09T00:00:00.000Z',
          decidedAt: '2026-07-09T00:01:00.000Z',
        },
      });
    });

    const response = await approveCvAccess({
      request: new Request('https://buxx.me/dev/portal/cv/api/requests/request-1/approve', {
        method: 'POST',
        headers: { 'cf-access-jwt-assertion': 'access.jwt.test' },
      }),
      params: { id: 'request-1' },
      locals: { env: { API: api } },
    } as never);

    expect(response.status).toBe(200);
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('https://site-api.internal/api/admin/cv/requests/request-1/approve');
    expect(requests[0].method).toBe('POST');
    expect(requests[0].headers.get('cf-access-jwt-assertion')).toBe('access.jwt.test');
  });
});
