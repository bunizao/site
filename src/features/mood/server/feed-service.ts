import { getMoodGallery } from '@/features/mood/shared/gallery';
import {
  getFirstImageMeta,
  getInlineMediaPreview,
  getQuotePreview,
  getTextPreview,
  getTextPreviewHtml,
  hasEmojiImageMedia,
  hasMedia,
  hasTooBigVideo,
  isLongContent,
} from '@/lib/mood-utils';
import { getTelegramPostFallbackInfo, type ChannelInfo, type Post } from '@/lib/telegram';
import type { MoodFeedItem, MoodFeedResponse } from './contracts';
import {
  getMoodChannelEmojiId,
  getMoodChannelSlug,
  getMoodHdImageBase,
  toMoodAvatarUrl,
  type MoodServerContext,
} from './channel-service';

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

export async function buildMoodFeedItem(
  context: MoodServerContext,
  post: Post,
  channelInfo: ChannelInfo
): Promise<MoodFeedItem> {
  const mediaPreview = getInlineMediaPreview(post.content);
  const tooBigVideo = hasTooBigVideo(post.content);
  let previewText = getTextPreview(post);
  let previewHtml = getTextPreviewHtml(post);
  const gallery = getMoodGallery(post.content);
  const leadItem = gallery?.items[0] ?? null;
  const imageMeta = getFirstImageMeta(post.content);
  const rawQuote = getQuotePreview(post.content, {
    channel: getMoodChannelSlug(context.locals),
    channelTitle: channelInfo.title?.trim() ?? '',
    hdImageBase: getMoodHdImageBase(context.locals),
  });
  const quote = rawQuote ? { ...rawQuote } : null;
  const hasDetailMedia = hasMedia(post.content) || hasEmojiImageMedia(post.content);
  const isUnsupportedFallbackImage = post.content.includes('image-preview-wrap--fallback');

  if (isUnsupportedFallbackImage && !previewText.trim()) {
    const fallbackInfo = await getTelegramPostFallbackInfo(
      { request: context.request, locals: context.locals } as any,
      post.id
    );
    if (fallbackInfo.hasUnsupportedMediaNotice && !fallbackInfo.hasVisibleText && fallbackInfo.description) {
      previewText = fallbackInfo.description;
      previewHtml = buildPlainPreviewHtml(fallbackInfo.description);
    }
  }

  if (quote && !quote.thumbnailSrc && quote.href) {
    const match = quote.href.match(/^\/mood\/(\d+)$/);
    const targetId = match?.[1] ?? '';
    const hdImageBase = getMoodHdImageBase(context.locals);
    if (targetId && hdImageBase) {
      const fallbackInfo = await getTelegramPostFallbackInfo(
        { request: context.request, locals: context.locals } as any,
        targetId
      );
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
}

export async function buildMoodFeedItems(
  context: MoodServerContext,
  channelInfo: ChannelInfo,
  posts: Post[]
): Promise<MoodFeedItem[]> {
  return Promise.all(posts.map((post) => buildMoodFeedItem(context, post, channelInfo)));
}

export async function buildMoodFeedResponse(
  context: MoodServerContext,
  channelInfo: ChannelInfo,
  posts: Post[]
): Promise<MoodFeedResponse> {
  const payload = await buildMoodFeedItems(context, channelInfo, posts);
  const channelTitle = channelInfo.title?.trim() ?? '';

  return {
    posts: payload,
    channel: {
      slug: getMoodChannelSlug(context.locals) || undefined,
      title: channelTitle || undefined,
      titleHTML: channelInfo.titleHTML || undefined,
      emojiId: getMoodChannelEmojiId(context.locals) || undefined,
      avatar: toMoodAvatarUrl(channelInfo.avatar || '', context.locals) || undefined,
      description: channelInfo.description || undefined,
      descriptionHTML: channelInfo.descriptionHTML || undefined,
    },
  };
}
