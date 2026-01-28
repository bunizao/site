import type { APIRoute } from 'astro';
import { getPostComments } from '../../lib/telegram';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const postId = url.searchParams.get('postId') ?? '';
  const before = url.searchParams.get('before') ?? '';

  if (!postId) {
    return new Response(JSON.stringify({ error: 'Missing postId parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
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
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Failed to fetch comments:', error);
    return new Response(JSON.stringify({ comments: [], hasMore: false }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
