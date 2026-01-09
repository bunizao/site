import type { APIRoute } from 'astro';
import * as cheerio from 'cheerio';
import { getChannelInfo, type ChannelInfo } from '../../lib/telegram';

export const prerender = false;

function getFirstImage(content: string): string | null {
  const match = content.match(/<img[^>]+src="([^">]+)"/);
  return match ? match[1] : null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|blockquote)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getNumericId(id: string): number {
  const parsed = Number.parseInt(id, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function hasMedia(content: string): boolean {
  return /<(img|video|audio|iframe)/i.test(content);
}

function isLongContent(text: string): boolean {
  return text.length > 280;
}

function getInlineMediaPreview(content: string): { type: 'video' | 'audio' | 'bookmark'; html: string } | null {
  const $ = cheerio.load(content);

  const video = $('video').first();
  if (video.length) {
    return { type: 'video', html: $.html(video) };
  }

  const audio = $('audio').first();
  if (audio.length) {
    return { type: 'audio', html: $.html(audio) };
  }

  const bookmark = $('.bookmark-card').first();
  if (bookmark.length) {
    return { type: 'bookmark', html: $.html(bookmark) };
  }

  return null;
}

function getTextPreview(post: { text?: string; content: string }): string {
  const fallback = (post.text ?? '').trim();
  const $ = cheerio.load(post.content);
  $('blockquote').remove();
  $('.bookmark-card').remove();
  $('video, audio, iframe').remove();
  $('.image-list-container, .image-preview-wrap, .image-preview-button, .sticker').remove();
  $('.tgme_widget_message_poll, .tgme_widget_message_document_wrap, .tgme_widget_message_video_player, .tgme_widget_message_location_wrap').remove();
  const cleanedHtml = $.root().html() ?? '';
  const preview = stripHtml(cleanedHtml);
  return preview || fallback;
}

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
      const needsDetailPage = !mediaPreview && (hasMedia(post.content) || isLongContent(previewText));
      return {
        id: post.id,
        datetime: post.datetime,
        tag: post.tags?.[0] ?? '',
        previewText,
        image: mediaPreview ? null : getFirstImage(post.content),
        mediaHtml: mediaPreview?.html ?? '',
        needsDetailPage,
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
