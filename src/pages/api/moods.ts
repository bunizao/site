import type { APIRoute } from 'astro';
import { createE2EChannelInfo, isE2ESiteFixtureEnabled } from '@/lib/e2e-fixtures';
import { getChannelInfo, type ChannelInfo } from '../../lib/telegram';
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
      const imageMeta = getFirstImageMeta(post.content);
      return {
        id: post.id,
        datetime: post.datetime,
        tag: post.tags?.[0] ?? '',
        previewText: getTextPreview(post),
        previewHtml: getTextPreviewHtml(post),
        image: imageMeta.src,
        imageFallback: imageMeta.fallbackSrc,
        imageWidth: imageMeta.width,
        imageHeight: imageMeta.height,
        imageLayout: imageMeta.layout,
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

    const payload = sortedPosts.map((post) => {
      const mediaPreview = getInlineMediaPreview(post.content);
      const tooBigVideo = hasTooBigVideo(post.content);
      const previewText = getTextPreview(post);
      const previewHtml = getTextPreviewHtml(post);
      const imageMeta = getFirstImageMeta(post.content);
      const quote = getQuotePreview(post.content, { channel, channelTitle, hdImageBase });
      const hasDetailMedia = hasMedia(post.content) || hasEmojiImageMedia(post.content);
      const needsDetailPage = !mediaPreview && (hasDetailMedia || tooBigVideo || isLongContent(previewText));
      return {
        id: post.id,
        datetime: post.datetime,
        tag: post.tags?.[0] ?? '',
        previewText,
        previewHtml,
        previewMediaType: tooBigVideo ? 'too-big-video' : '',
        image: mediaPreview ? null : imageMeta.src,
        imageFallback: mediaPreview ? null : imageMeta.fallbackSrc,
        imageWidth: mediaPreview ? null : imageMeta.width,
        imageHeight: mediaPreview ? null : imageMeta.height,
        imageLayout: mediaPreview ? null : imageMeta.layout,
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
