import type { APIRoute } from 'astro';
import { createE2EComments, isE2ESiteFixtureEnabled } from '@/lib/e2e-fixtures';
import {
  json,
  jsonBadRequest,
  jsonOk,
  jsonTooManyRequests,
} from '@/lib/http/json-response';
import { isValidCursor, readCursorQuery } from '@/lib/http/query';
import { withRateLimit } from '@/lib/http/rate-limited';
import type { MoodCommentsPage } from '@/features/mood/server/contracts';
import { getPostComments } from '../../lib/telegram';

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

  if (isE2ESiteFixtureEnabled(locals)) {
    const fixture = createE2EComments(postId) as MoodCommentsPage;
    return jsonOk(fixture, rateLimit.headers);
  }

  try {
    const result = await getPostComments({ request, locals } as any, { postId, before });
    const body: MoodCommentsPage = {
      comments: result.comments.map((comment) => ({
        id: comment.id,
        author: comment.author,
        authorAvatar: comment.authorAvatar,
        datetime: comment.datetime,
        content: comment.content,
        reactions: comment.reactions.map((reaction) => ({
          emoji: reaction.emoji,
          emojiId: reaction.emojiId,
          emojiImage: reaction.emojiImage,
          count: reaction.count,
          isPaid: reaction.isPaid,
        })),
      })),
      hasMore: result.hasMore,
      nextBefore: result.nextBefore || '',
    };

    return jsonOk(body, rateLimit.headers);
  } catch (error) {
    console.error('Failed to fetch comments:', error);
    return json(500, { comments: [], hasMore: false, nextBefore: '' }, rateLimit.headers);
  }
};
