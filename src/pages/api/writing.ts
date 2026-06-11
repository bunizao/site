import type { APIRoute } from 'astro';
import { fetchLatestGhostPosts, readGhostUrl } from '@/features/home/server/ghost-posts';
import { jsonOk, jsonTooManyRequests } from '@/lib/http/json-response';
import { withRateLimit } from '@/lib/http/rate-limited';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const rateLimit = withRateLimit(
    request,
    { windowMs: 60_000, max: 60, prefix: 'api:writing' },
    locals
  );
  const headers = new Headers(rateLimit.headers);

  if (!rateLimit.allowed) {
    headers.set('Cache-Control', 'no-store, max-age=0');
    return jsonTooManyRequests(headers);
  }

  headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  return jsonOk({
    ghostUrl: readGhostUrl(locals),
    posts: await fetchLatestGhostPosts({ locals, limit: 5 }),
  }, headers);
};
