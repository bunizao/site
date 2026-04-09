import type { APIRoute } from 'astro';
import { createE2EChannelInfo, isE2ESiteFixtureEnabled } from '@/lib/e2e-fixtures';
import { getChannelInfo, getTelegramPostFallbackInfo, type ChannelInfo } from '../../lib/telegram';
import {
  getFirstImageMeta,
  getInlineMediaPreview,
  getTextPreview,
  getTextPreviewHtml,
  getQuotePreview,
  getNumericId,
  hasEmojiImageMedia,
  hasMedia,
  hasTooBigVideo,
  isLongContent,
} from '../../lib/mood-utils';
import { getMoodGallery } from '@/features/mood/shared/gallery';
import { checkRateLimit, createRateLimitHeaders } from '../../lib/security/rate-limit';

export const prerender = false;

const CURSOR_PATTERN = /^\d{1,20}$/;

function isValidCursor(value: string): boolean {
  return !value || CURSOR_PATTERN.test(value);
}

function readEnv(locals: any, name: string): string {
  const buildValue = import.meta.env[name];
  if (typeof buildValue === 'string' && buildValue.trim()) {
    return buildValue;
  }

  const runtimeValue = locals?.runtime?.env?.[name] ?? locals?.env?.[name];
  if (typeof runtimeValue === 'string') {
    return runtimeValue;
  }

  return '';
}

function getHdImageOrigin(locals: any): string {
  const hdImageUrl = readEnv(locals, 'PUBLIC_HD_IMAGE_URL');
  if (!hdImageUrl) return '';

  try {
    return new URL(hdImageUrl).origin.toLowerCase();
  } catch {
    return '';
  }
}

function getHdImageBase(locals: any): string {
  return readEnv(locals, 'PUBLIC_HD_IMAGE_URL').replace(/\/+$/, '');
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
  const before = url.searchParams.get('before') ?? '';
  const after = url.searchParams.get('after') ?? '';
  const isProbe = url.searchParams.get('probe') === '1';
  const skipCache = url.searchParams.get('fresh') === '1';
  const rateLimit = checkRateLimit(
    request,
    isProbe
      ? { windowMs: 60_000, max: 90, prefix: 'api:moods:probe' }
      : skipCache
        ? { windowMs: 60_000, max: 30, prefix: 'api:moods:fresh' }
        : { windowMs: 60_000, max: 180, prefix: 'api:moods' },
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

  if (!isValidCursor(before) || !isValidCursor(after)) {
    return new Response(JSON.stringify({ error: 'Invalid cursor parameter' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        ...Object.fromEntries(rateLimitHeaders),
      },
    });
  }

  if (isE2ESiteFixtureEnabled(locals)) {
    const fixture = createE2EChannelInfo();
    const sortedPosts = [...fixture.posts].sort((a, b) => getNumericId(b.id) - getNumericId(a.id));

    if (isProbe) {
      return new Response(
        JSON.stringify({
          latestId: sortedPosts[0]?.id ?? '',
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, max-age=0',
            ...Object.fromEntries(rateLimitHeaders),
          },
        }
      );
    }

    const payload = sortedPosts.map((post) => {
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

    return new Response(JSON.stringify({
      posts: payload,
      channel: {
        slug: 'e2e',
        title: fixture.title,
        titleHTML: fixture.titleHTML,
        avatar: fixture.avatar || undefined,
        description: fixture.description,
        descriptionHTML: fixture.descriptionHTML,
      },
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': skipCache ? 'no-store, max-age=0' : 'public, max-age=0',
        ...Object.fromEntries(rateLimitHeaders),
      },
    });
  }

  const channel = import.meta.env.CHANNEL || locals?.runtime?.env?.CHANNEL || '';
  const channelEmojiId = import.meta.env.CHANNEL_EMOJI_ID || locals?.env?.CHANNEL_EMOJI_ID || '';
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
      return new Response(
        JSON.stringify({
          latestId: sortedPosts[0]?.id ?? '',
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, max-age=0',
            ...Object.fromEntries(rateLimitHeaders),
          },
        }
      );
    }

    const payload = await Promise.all(sortedPosts.map(async (post) => {
      const mediaPreview = getInlineMediaPreview(post.content);
      const tooBigVideo = hasTooBigVideo(post.content);
      let previewText = getTextPreview(post);
      let previewHtml = getTextPreviewHtml(post);
      const gallery = getMoodGallery(post.content);
      const leadItem = gallery?.items[0] ?? null;
      const imageMeta = getFirstImageMeta(post.content);
      const rawQuote = getQuotePreview(post.content, { channel, channelTitle, hdImageBase });
      let quote = rawQuote ? { ...rawQuote } : null;
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
        reactions: post.reactions?.map((r) => ({
          emoji: r.emoji,
          emojiId: r.emojiId,
          emojiImage: r.emojiImage,
          count: r.count,
          isPaid: r.isPaid,
        })) ?? [],
        commentsCount: post.commentsCount ?? 0,
      };
    }));

    const avatarUrl = toChannelAvatarUrl(channelInfo.avatar || '', locals);

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
        ...Object.fromEntries(rateLimitHeaders),
      },
    });
  } catch (error) {
    console.error('Failed to fetch moods:', error);
    return new Response(JSON.stringify({ posts: [] }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...Object.fromEntries(rateLimitHeaders),
      },
    });
  }
};
