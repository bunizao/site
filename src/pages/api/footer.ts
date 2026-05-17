import type { APIRoute } from 'astro';
import { $fetch } from 'ofetch';
import { json } from '@/lib/http/json-response';
import { withRateLimit } from '@/lib/http/rate-limited';

export const prerender = false;

type FooterStatus = 'operational' | 'degraded' | 'down' | 'maintenance' | 'unknown';

const OPENSTATUS_URL = 'https://api.openstatus.dev/public/status/status';

function normalize(raw: unknown): FooterStatus {
  if (typeof raw !== 'string') return 'unknown';
  switch (raw) {
    case 'operational':
      return 'operational';
    case 'degraded_performance':
      return 'degraded';
    case 'downtime':
    case 'incident':
      return 'down';
    case 'under_maintenance':
      return 'maintenance';
    default:
      return 'unknown';
  }
}

export const GET: APIRoute = async ({ request, locals }) => {
  const rateLimit = withRateLimit(
    request,
    { windowMs: 60_000, max: 60, prefix: 'api:footer' },
    locals
  );
  const headers = new Headers(rateLimit.headers);
  headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');

  if (!rateLimit.allowed) {
    return json(429, { error: 'Too Many Requests' }, headers);
  }

  let status: FooterStatus = 'unknown';
  try {
    const payload = await $fetch<{ status?: string }>(OPENSTATUS_URL, {
      timeout: 5_000,
      retry: 0,
    });
    status = normalize(payload?.status);
  } catch (error) {
    console.warn('OpenStatus probe failed:', error);
  }

  return json(200, { status }, headers);
};
