import type { APIRoute } from 'astro';
import { $fetch } from 'ofetch';
import { json } from '@/lib/http/json-response';
import { withRateLimit } from '@/lib/http/rate-limited';

export const prerender = false;

type FooterStatus = 'operational' | 'degraded' | 'down' | 'maintenance' | 'unknown';

const BETTER_STACK_STATUS_URL = 'https://status.tuuhub.com/index.json';

export function normalizeBetterStackAggregateState(raw: unknown): FooterStatus {
  if (typeof raw !== 'string') return 'unknown';
  switch (raw) {
    case 'operational':
      return 'operational';
    case 'degraded':
      return 'degraded';
    case 'downtime':
      return 'down';
    case 'maintenance':
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

  if (import.meta.env.DEV && !request.headers.get('x-vercel-id')) {
    headers.set('x-vercel-id', 'mel1::demo');
  }

  if (!rateLimit.allowed) {
    return json(429, { error: 'Too Many Requests' }, headers);
  }

  let status: FooterStatus = 'unknown';
  let updatedAt = '';
  try {
    const payload = await $fetch<{
      data?: {
        attributes?: {
          aggregate_state?: string;
          updated_at?: string;
        };
      };
    }>(BETTER_STACK_STATUS_URL, {
      timeout: 5_000,
      retry: 0,
    });
    const attributes = payload?.data?.attributes;
    status = normalizeBetterStackAggregateState(attributes?.aggregate_state);
    updatedAt = attributes?.updated_at ?? '';
  } catch (error) {
    console.warn('Better Stack status probe failed:', error);
  }

  return json(200, { status, provider: 'betterstack', updatedAt }, headers);
};
