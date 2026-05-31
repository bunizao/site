import type { APIRoute } from 'astro';
import { json } from '@/lib/http/json-response';
import { withRateLimit } from '@/lib/http/rate-limited';

export const prerender = false;

type FooterStatus = 'operational' | 'degraded' | 'down' | 'maintenance' | 'unknown';

const BETTER_STACK_STATUS_URL = 'https://status.tuuhub.com/index.json';

interface BetterStackStatusPayload {
  data?: {
    attributes?: {
      aggregate_state?: string;
      updated_at?: string;
    };
  };
}

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

function parseBetterStackPayload(payload: unknown): BetterStackStatusPayload | null {
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload) as BetterStackStatusPayload;
    } catch {
      return null;
    }
  }

  if (typeof payload === 'object' && payload !== null) {
    return payload as BetterStackStatusPayload;
  }

  return null;
}

export function getBetterStackFooterState(payload: unknown): { status: FooterStatus; updatedAt: string } {
  const attributes = parseBetterStackPayload(payload)?.data?.attributes;
  return {
    status: normalizeBetterStackAggregateState(attributes?.aggregate_state),
    updatedAt: attributes?.updated_at ?? '',
  };
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    try {
      const response = await fetch(BETTER_STACK_STATUS_URL, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Better Stack status returned ${response.status}`);
      }
      ({ status, updatedAt } = getBetterStackFooterState(await response.text()));
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    console.warn('Better Stack status probe failed:', error);
  }

  return json(200, { status, provider: 'betterstack', updatedAt }, headers);
};
