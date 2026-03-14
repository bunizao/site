import type { APIRoute } from 'astro';
import { createE2EComments, isE2ESiteFixtureEnabled } from '@/lib/e2e-fixtures';
import { getPostComments } from '../../lib/telegram';
import { checkRateLimit, createRateLimitHeaders } from '../../lib/security/rate-limit';

export const prerender = false;

const COMMENT_ID_PATTERN = /^\d{1,20}$/;

function isValidCommentCursor(value: string): boolean {
  return !value || COMMENT_ID_PATTERN.test(value);
}

export const GET: APIRoute = async ({ request, locals }) => {
  const rateLimit = checkRateLimit(
    request,
    { windowMs: 60_000, max: 90, prefix: 'api:comments' },
    locals
  );
  const rateLimitHeaders = createRateLimitHeaders(rateLimit);
  if (!rateLimit.allowed) {
    return new Response(JSON.stringify({ error: 'Too Many Requests' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        ...Object.fromEntries(rateLimitHeaders),
      },
    });
  }

  const url = new URL(request.url);
  const postId = url.searchParams.get('postId') ?? '';
  const before = url.searchParams.get('before') ?? '';

  if (!postId) {
    return new Response(JSON.stringify({ error: 'Missing postId parameter' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        ...Object.fromEntries(rateLimitHeaders),
      },
    });
  }

  if (!COMMENT_ID_PATTERN.test(postId)) {
    return new Response(JSON.stringify({ error: 'Invalid postId parameter' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        ...Object.fromEntries(rateLimitHeaders),
      },
    });
  }

  if (!isValidCommentCursor(before)) {
    return new Response(JSON.stringify({ error: 'Invalid before parameter' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        ...Object.fromEntries(rateLimitHeaders),
      },
    });
  }

  if (isE2ESiteFixtureEnabled(locals)) {
    const fixture = createE2EComments(postId);
    return new Response(JSON.stringify(fixture), {
      headers: {
        'Content-Type': 'application/json',
        ...Object.fromEntries(rateLimitHeaders),
      },
    });
  }

  try {
    const result = await getPostComments({ request, locals } as any, { postId, before });

    return new Response(JSON.stringify({
      comments: result.comments.map((comment) => ({
        id: comment.id,
        author: comment.author,
        authorAvatar: comment.authorAvatar,
        datetime: comment.datetime,
        content: comment.content,
        reactions: comment.reactions.map((r) => ({
          emoji: r.emoji,
          emojiId: r.emojiId,
          emojiImage: r.emojiImage,
          count: r.count,
          isPaid: r.isPaid,
        })),
      })),
      hasMore: result.hasMore,
      nextBefore: result.nextBefore || '',
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...Object.fromEntries(rateLimitHeaders),
      },
    });
  } catch (error) {
    console.error('Failed to fetch comments:', error);
    return new Response(JSON.stringify({ comments: [], hasMore: false }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...Object.fromEntries(rateLimitHeaders),
      },
    });
  }
};
