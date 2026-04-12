import type { APIRoute } from 'astro';
import { createE2EChannelInfo, isE2ESiteFixtureEnabled } from '@/lib/e2e-fixtures';
import {
  json,
  jsonBadRequest,
  jsonOk,
  jsonTooManyRequests,
} from '@/lib/http/json-response';
import {
  isValidCursor,
  readBooleanFlag,
  readCursorQuery,
} from '@/lib/http/query';
import { withRateLimit } from '@/lib/http/rate-limited';
import {
  getFirstImageMeta,
  getInlineMediaPreview,
  getNumericId,
  getQuotePreview,
  getTextPreview,
  getTextPreviewHtml,
  hasEmojiImageMedia,
  hasMedia,
  hasTooBigVideo,
  isLongContent,
} from '@/lib/mood-utils';
import { readEnv, readPublicEnv } from '@/lib/runtime/env';
import {
  type MoodFeedItem,
  type MoodFeedResponse,
  type MoodProbeResult,
} from '@/features/mood/server/contracts';
import { getMoodGallery } from '@/features/mood/shared/gallery';
import { getChannelInfo, getTelegramPostFallbackInfo, type ChannelInfo } from '../../lib/telegram';

export const prerender = false;

function getHdImageOrigin(locals: any): string {
  const hdImageUrl = readPublicEnv(locals, 'HD_IMAGE_URL');
  if (!hdImageUrl) return '';

  try {
    return new URL(hdImageUrl).origin.toLowerCase();
  } catch {
    return '';
  }
}

function getHdImageBase(locals: any): string {
  return readPublicEnv(locals, 'HD_IMAGE_URL').replace(/\/+$/, '');
}

function toChannelAvatarUrl(avatar: string, locals: any): string {
  if (!avatar) return '';
  if (avatar.startsWith('/static/')) return avatar;

  const normalized = avatar.startsWith('http') ? avatar : `https:${avatar}`;
  const hdImageOrigin = getHdImageOrigin(locals);

  if (hdImageOrigin) {
    try {
      if (new URL(normalized).origin.toLowerCase() === hdImageOrigin) {
        return normalized;
      }
    } catch {
      // Fall through to static proxy fallback.
    }
  }

  return `/static/${normalized}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case '\'':
        return '&#39;';
      default:
        return char;
    }
  });
}

function buildPlainPreviewHtml(text: string): string {
  const normalized = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();

  if (!normalized) return '';
  return escapeHtml(normalized).replace(/\n/g, '<br>');
}

export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const before = readCursorQuery(url, 'before');
  const after = readCursorQuery(url, 'after');
  const isProbe = readBooleanFlag(url, 'probe');
  const skipCache = readBooleanFlag(url, 'fresh');
  const rateLimit = withRateLimit(
    request,
    isProbe
      ? { windowMs: 60_000, max: 90, prefix: 'api:moods:probe' }
      : skipCache
        ? { windowMs: 60_000, max: 30, prefix: 'api:moods:fresh' }
        : { windowMs: 60_000, max: 180, prefix: 'api:moods' },
    locals
  );

  if (!rateLimit.allowed) {
    return jsonTooManyRequests(rateLimit.headers);
  }

  if (!isValidCursor(before) || !isValidCursor(after)) {
    return jsonBadRequest('Invalid cursor parameter', rateLimit.headers);
  }

  if (isE2ESiteFixtureEnabled(locals)) {
    const fixture = createE2EChannelInfo();
    const sortedPosts = [...fixture.posts].sort((a, b) => getNumericId(b.id) - getNumericId(a.id));

    if (isProbe) {
      const headers = new Headers(rateLimit.headers);
      headers.set('Cache-Control', 'no-store, max-age=0');
      const body: MoodProbeResult = {
        latestId: sortedPosts[0]?.id ?? '',
      };
      return jsonOk(body, headers);
    }

    const payload: MoodFeedItem[] = sortedPosts.map((post) => {
      const gallery = getMoodGallery(post.content);
      const leadItem = gallery?.items[0] ?? null;
      const imageMeta = getFirstImageMeta(post.content);
      return {
        id: post.id,
        datetime: post.datetime,
        tag: post.tags?.[0] ?? '',
        previewText: getTextPreview(post),
        previewHtml: getTextPreviewHtml(post),
        gallery,
        image: leadItem?.src ?? imageMeta.src,
        imageFallback: leadItem?.fallbackSrc ?? imageMeta.fallbackSrc,
        imageWidth: leadItem?.width ?? imageMeta.width,
        imageHeight: leadItem?.height ?? imageMeta.height,
        imageLayout: leadItem?.layout ?? imageMeta.layout,
        mediaHtml: '',
        needsDetailPage: true,
        forwardedFrom: null,
        quote: null,
        reactions: [],
        commentsCount: post.commentsCount ?? 0,
      };
    });

    const headers = new Headers(rateLimit.headers);
    headers.set('Cache-Control', skipCache ? 'no-store, max-age=0' : 'public, max-age=0');
    const body: MoodFeedResponse = {
      posts: payload,
      channel: {
        slug: 'e2e',
        title: fixture.title,
        titleHTML: fixture.titleHTML,
        avatar: fixture.avatar || undefined,
        description: fixture.description,
        descriptionHTML: fixture.descriptionHTML,
      },
    };

    return jsonOk(body, headers);
  }

  const channel = readEnv(locals, 'CHANNEL');
  const channelEmojiId = readEnv(locals, 'CHANNEL_EMOJI_ID');
  const hdImageBase = getHdImageBase(locals);

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
      const headers = new Headers(rateLimit.headers);
      headers.set('Cache-Control', 'no-store, max-age=0');
      const body: MoodProbeResult = {
        latestId: sortedPosts[0]?.id ?? '',
      };
      return jsonOk(body, headers);
    }

    const payload: MoodFeedItem[] = await Promise.all(sortedPosts.map(async (post) => {
      const mediaPreview = getInlineMediaPreview(post.content);
      const tooBigVideo = hasTooBigVideo(post.content);
      let previewText = getTextPreview(post);
      let previewHtml = getTextPreviewHtml(post);
      const gallery = getMoodGallery(post.content);
      const leadItem = gallery?.items[0] ?? null;
      const imageMeta = getFirstImageMeta(post.content);
      const rawQuote = getQuotePreview(post.content, { channel, channelTitle, hdImageBase });
      const quote = rawQuote ? { ...rawQuote } : null;
      const hasDetailMedia = hasMedia(post.content) || hasEmojiImageMedia(post.content);
      const isUnsupportedFallbackImage = post.content.includes('image-preview-wrap--fallback');

      if (isUnsupportedFallbackImage && !previewText.trim()) {
        const fallbackInfo = await getTelegramPostFallbackInfo({ request, locals } as any, post.id);
        if (fallbackInfo.hasUnsupportedMediaNotice && !fallbackInfo.hasVisibleText && fallbackInfo.description) {
          previewText = fallbackInfo.description;
          previewHtml = buildPlainPreviewHtml(fallbackInfo.description);
        }
      }

      if (quote && !quote.thumbnailSrc && quote.href) {
        const match = quote.href.match(/^\/mood\/(\d+)$/);
        const targetId = match?.[1] ?? '';
        if (targetId && hdImageBase) {
          const fallbackInfo = await getTelegramPostFallbackInfo({ request, locals } as any, targetId);
          if (fallbackInfo.hasUnsupportedMediaNotice && !fallbackInfo.hasVisibleText) {
            quote.thumbnailSrc = `${hdImageBase}/mood/${encodeURIComponent(targetId)}/0`;
          }
        }
      }

      const needsDetailPage = !mediaPreview && (hasDetailMedia || tooBigVideo || isLongContent(previewText));
      return {
        id: post.id,
        datetime: post.datetime,
        tag: post.tags?.[0] ?? '',
        previewText,
        previewHtml,
        previewMediaType: tooBigVideo ? 'too-big-video' : '',
        gallery: mediaPreview ? null : gallery,
        image: mediaPreview ? null : leadItem?.src ?? imageMeta.src,
        imageFallback: mediaPreview ? null : leadItem?.fallbackSrc ?? imageMeta.fallbackSrc,
        imageWidth: mediaPreview ? null : leadItem?.width ?? imageMeta.width,
        imageHeight: mediaPreview ? null : leadItem?.height ?? imageMeta.height,
        imageLayout: mediaPreview ? null : leadItem?.layout ?? imageMeta.layout,
        mediaHtml: mediaPreview?.html ?? '',
        needsDetailPage,
        forwardedFrom: post.forwardedFrom ?? null,
        quote: quote ?? null,
        reactions: post.reactions?.map((reaction) => ({
          emoji: reaction.emoji,
          emojiId: reaction.emojiId,
          emojiImage: reaction.emojiImage,
          count: reaction.count,
          isPaid: reaction.isPaid,
        })) ?? [],
        commentsCount: post.commentsCount ?? 0,
      };
    }));

    const avatarUrl = toChannelAvatarUrl(channelInfo.avatar || '', locals);
    const headers = new Headers(rateLimit.headers);
    headers.set('Cache-Control', skipCache ? 'no-store, max-age=0' : 'public, max-age=0');
    const body: MoodFeedResponse = {
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
    };

    return jsonOk(body, headers);
  } catch (error) {
    console.error('Failed to fetch moods:', error);
    return json(500, { posts: [] }, rateLimit.headers);
  }
};
