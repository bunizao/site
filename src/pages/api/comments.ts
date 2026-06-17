import type { APIRoute } from 'astro';
import { readCursorQuery } from '@/lib/http/query';
import { handleMoodCommentsApiRoute } from '@/features/mood/server/api-routes';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const postId = readCursorQuery(url, 'postId');
  return handleMoodCommentsApiRoute(
    { request, locals },
    { postId, source: 'live', rateLimitPrefix: 'api:comments' }
  );
};
