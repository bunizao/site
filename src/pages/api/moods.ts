import type { APIRoute } from 'astro';
import { getChannelInfo, type ChannelInfo } from '../../lib/telegram';
import {
  getFirstImage,
  getInlineMediaPreview,
  getTextPreview,
  getQuotePreview,
  getNumericId,
  hasMedia,
  isLongContent,
} from '../../lib/mood-utils';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const before = url.searchParams.get('before') ?? '';

  try {
    const result = await getChannelInfo({ request, locals } as any, { type: 'list', before });
    const posts = (result as ChannelInfo).posts ?? [];
    const sortedPosts = [...posts].sort((a, b) => getNumericId(b.id) - getNumericId(a.id));

    const payload = sortedPosts.map((post) => {
      const mediaPreview = getInlineMediaPreview(post.content);
      const previewText = getTextPreview(post);
      const quote = getQuotePreview(post.content);
      const needsDetailPage = !mediaPreview && (hasMedia(post.content) || isLongContent(previewText));
      return {
        id: post.id,
        datetime: post.datetime,
        tag: post.tags?.[0] ?? '',
        previewText,
        image: mediaPreview ? null : getFirstImage(post.content),
        mediaHtml: mediaPreview?.html ?? '',
        needsDetailPage,
        forwardedFrom: post.forwardedFrom ?? null,
        quote: quote ?? null,
        reactions: post.reactions?.map((r) => ({
          emoji: r.emoji,
          emojiId: r.emojiId,
          emojiImage: r.emojiImage,
          count: r.count,
          isPaid: r.isPaid,
        })) ?? [],
      };
    });

    return new Response(JSON.stringify({ posts: payload }), {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Failed to fetch moods:', error);
    return new Response(JSON.stringify({ posts: [] }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
};
