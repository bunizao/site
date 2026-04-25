import type { APIRoute } from 'astro';
import { getCurrentListeningTrack } from '@/features/home/server/listening';
import { json, jsonError, jsonOk } from '@/lib/http/json-response';
import { withRateLimit } from '@/lib/http/rate-limited';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const rateLimit = withRateLimit(
    request,
    { windowMs: 60_000, max: 60, prefix: 'api:listening' },
    locals
  );
  const headers = new Headers(rateLimit.headers);
  headers.set('Cache-Control', 'no-store, max-age=0');

  if (!rateLimit.allowed) {
    return jsonError(429, 'Too Many Requests', headers);
  }

  try {
    const result = await getCurrentListeningTrack(locals);
    if (!result.configured) {
      return json(200, {
        track: result.track,
        configured: false,
        source: result.source
      }, headers);
    }

    return jsonOk({
      track: result.track,
      configured: true,
      source: result.source
    }, headers);
  } catch (error) {
    console.error('Failed to fetch listening track:', error);
    return jsonError(500, 'Listening data unavailable', headers);
  }
};

export const ALL: APIRoute = async () => {
  return new Response('Method Not Allowed', { status: 405 });
};
