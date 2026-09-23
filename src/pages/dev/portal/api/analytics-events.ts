import type { APIRoute } from 'astro';
import {
  BLOG_ANALYTICS_EVENTS_DEFAULT_LIMIT,
  BLOG_ANALYTICS_EVENTS_ENDPOINT,
  type BlogAnalyticsEventsResult,
} from '@bunizao/contracts/analytics';
import { jsonError, jsonOk } from '@/lib/http/json-response';
import { adminGet } from '@/features/admin/server/portal-client';
import { DEMO_ANALYTICS } from '@/features/admin/server/portal-analytics-demo';

// Static route — literal paths win over the sibling `[...path].ts` rest
// route, so this is reached before the admin-only proxy sees it.
export const prerender = false;

const MIN_LIMIT = 1;
const MAX_LIMIT = 200;

function clampLimit(raw: string | null): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return BLOG_ANALYTICS_EVENTS_DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.trunc(parsed)));
}

export const GET: APIRoute = async ({ request, locals }) => {
  const limit = clampLimit(new URL(request.url).searchParams.get('limit'));

  try {
    const data = await adminGet<BlogAnalyticsEventsResult>(
      `${BLOG_ANALYTICS_EVENTS_ENDPOINT}?limit=${limit}`,
      request,
      locals,
    );
    return jsonOk(data, { 'Cache-Control': 'no-store' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    // Local dev without the site-api binding: serve the same fixture the page
    // falls back to, so the polling UI stays exercisable. Never in prod.
    if (import.meta.env.DEV && message === 'api_binding_unavailable') {
      return jsonOk(
        { events: DEMO_ANALYTICS.events.events.slice(0, limit) } satisfies BlogAnalyticsEventsResult,
        { 'Cache-Control': 'no-store' },
      );
    }
    return jsonError(503, 'analytics_events_unavailable', { 'Cache-Control': 'no-store' });
  }
};

export const ALL: APIRoute = () =>
  jsonError(405, 'Method not allowed', { 'Cache-Control': 'no-store' });
