import type { APIRoute } from 'astro';
import { getChannelInfo, type ChannelInfo } from '../../lib/telegram';
import {
  getFirstImage,
  getInlineMediaPreview,
  getTextPreview,
  getTextPreviewHtml,
  getQuotePreview,
  getNumericId,
  hasMedia,
  isLongContent,
} from '../../lib/mood-utils';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const before = url.searchParams.get('before') ?? '';
  const after = url.searchParams.get('after') ?? '';
  const isProbe = url.searchParams.get('probe') === '1';
  const skipCache = url.searchParams.get('fresh') === '1';
  const channel = import.meta.env.CHANNEL || locals?.runtime?.env?.CHANNEL || '';
  const channelEmojiId = import.meta.env.CHANNEL_EMOJI_ID || locals?.env?.CHANNEL_EMOJI_ID || '';

  try {
    const result = await getChannelInfo({ request, locals } as any, {
      type: 'list',
      before,
      after,
      skipCache,
    });
    const channelInfo = result as ChannelInfo;
    const posts = channelInfo.posts ?? [];
    const sortedPosts = [...posts].sort((a, b) => getNumericId(b.id) - getNumericId(a.id));
    const channelTitle = channelInfo.title?.trim() ?? '';

    if (isProbe) {
      return new Response(
        JSON.stringify({
          latestId: sortedPosts[0]?.id ?? '',
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, max-age=0',
          },
        }
      );
    }

    const payload = sortedPosts.map((post) => {
      const mediaPreview = getInlineMediaPreview(post.content);
      const previewText = getTextPreview(post);
      const previewHtml = getTextPreviewHtml(post);
      const quote = getQuotePreview(post.content, { channel, channelTitle });
      const needsDetailPage = !mediaPreview && (hasMedia(post.content) || isLongContent(previewText));
      return {
        id: post.id,
        datetime: post.datetime,
        tag: post.tags?.[0] ?? '',
        previewText,
        previewHtml,
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
        commentsCount: post.commentsCount ?? 0,
      };
    });

    // Proxy avatar URL through static proxy for CORS
    const avatarUrl = channelInfo.avatar
      ? `/static/${channelInfo.avatar.startsWith('http') ? channelInfo.avatar : `https:${channelInfo.avatar}`}`
      : '';

    return new Response(JSON.stringify({
      posts: payload,
      channel: {
        slug: channel || undefined,
        title: channelTitle || undefined,
        titleHTML: channelInfo.titleHTML || undefined,
        emojiId: channelEmojiId || undefined,
        avatar: avatarUrl || undefined,
        description: channelInfo.description || undefined,
        descriptionHTML: channelInfo.descriptionHTML || undefined,
      },
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': skipCache ? 'no-store, max-age=0' : 'public, max-age=0',
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
