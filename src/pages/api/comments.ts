import type { APIRoute } from 'astro';
import {
  json,
  jsonBadRequest,
  jsonTooManyRequests,
} from '@/lib/http/json-response';
import { isValidCursor, readCursorQuery } from '@/lib/http/query';
import { withRateLimit } from '@/lib/http/rate-limited';
import { loadMoodCommentsPage } from '@/features/mood/server/comments-service';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const rateLimit = withRateLimit(
    request,
    { windowMs: 60_000, max: 90, prefix: 'api:comments' },
    locals
  );
  if (!rateLimit.allowed) {
    return jsonTooManyRequests(rateLimit.headers);
  }

  const url = new URL(request.url);
  const postId = readCursorQuery(url, 'postId');
  const before = readCursorQuery(url, 'before');

  if (!postId) {
    return jsonBadRequest('Missing postId parameter', rateLimit.headers);
  }

  if (!isValidCursor(postId)) {
    return jsonBadRequest('Invalid postId parameter', rateLimit.headers);
  }

  if (!isValidCursor(before)) {
    return jsonBadRequest('Invalid before parameter', rateLimit.headers);
  }

  try {
    const body = await loadMoodCommentsPage({ request, locals }, { postId, before });
    return json(200, body, rateLimit.headers);
  } catch (error) {
    console.error('Failed to fetch comments:', error);
    return json(500, { comments: [], hasMore: false, nextBefore: '' }, rateLimit.headers);
  }
};
