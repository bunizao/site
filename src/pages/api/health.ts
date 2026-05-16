import type { APIRoute } from 'astro';
import { runApiHealth } from '@/features/health/checks';
import { json } from '@/lib/http/json-response';
import { readBooleanFlag } from '@/lib/http/query';
import { withRateLimit } from '@/lib/http/rate-limited';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const deep = readBooleanFlag(url, 'deep');
  const rateLimit = withRateLimit(
    request,
    deep
      ? { windowMs: 60_000, max: 12, prefix: 'api:health:deep' }
      : { windowMs: 60_000, max: 60, prefix: 'api:health' },
    locals
  );
  const headers = new Headers(rateLimit.headers);
  headers.set('Cache-Control', 'no-store, max-age=0');

  if (!rateLimit.allowed) {
    return json(429, { error: 'Too Many Requests' }, headers);
  }

  const report = await runApiHealth({ request, locals, deep });
  return json(report.status === 'down' ? 503 : 200, report, headers);
};
