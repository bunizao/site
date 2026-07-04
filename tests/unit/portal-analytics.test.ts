import { describe, expect, test } from 'bun:test';
import {
  BLOG_ANALYTICS_EVENTS_DEFAULT_LIMIT,
  BLOG_ANALYTICS_EVENTS_ENDPOINT,
  BLOG_ANALYTICS_SUMMARY_ENDPOINT,
} from '@bunizao/contracts/analytics';
import { loadPortalAnalytics } from '../../src/features/admin/server/portal-client';
import type { ApiServiceBinding } from '../../src/lib/http/api-service-proxy';

function createApiBinding(handler: (request: Request) => Response | Promise<Response>): ApiServiceBinding {
  return {
    fetch: async (input) => handler(input as Request),
  };
}

describe('portal analytics client', () => {
  test('loads analytics through site-api with the Cloudflare Access JWT', async () => {
    const requests: Request[] = [];
    const api = createApiBinding((request) => {
      requests.push(request);

      const url = new URL(request.url);
      if (url.pathname === BLOG_ANALYTICS_SUMMARY_ENDPOINT) {
        return Response.json({
          range: { from: null, to: null, days: 7 },
          totals: {
            views: 1,
            reads: 1,
            uniqueVisitors: 1,
            avgReadMs: 6_000,
            avgVisitorReadMs: 6_000,
            completionRate: 1,
          },
          articles: [],
          platforms: [],
          countries: [],
          referrers: [],
          daily: [],
        });
      }

      if (url.pathname === BLOG_ANALYTICS_EVENTS_ENDPOINT) {
        expect(url.searchParams.get('limit')).toBe(String(BLOG_ANALYTICS_EVENTS_DEFAULT_LIMIT));
        return Response.json({ events: [], total: 0, nextCursor: null });
      }

      return Response.json({ error: 'unexpected' }, { status: 404 });
    });

    const result = await loadPortalAnalytics(
      new Request('https://buxx.me/dev/portal/analytics', {
        headers: { 'cf-access-jwt-assertion': 'access.jwt.test' },
      }),
      { env: { API: api } },
    );

    expect(result.summary.totals.views).toBe(1);
    expect(result.events.events).toEqual([]);
    expect(requests.map((request) => new URL(request.url).pathname).sort()).toEqual([
      BLOG_ANALYTICS_EVENTS_ENDPOINT,
      BLOG_ANALYTICS_SUMMARY_ENDPOINT,
    ].sort());
    expect(requests.every((request) => request.headers.get('cf-access-jwt-assertion') === 'access.jwt.test')).toBe(true);
    expect(requests.every((request) => request.headers.get('x-forwarded-host') === 'buxx.me')).toBe(true);
  });
});
