import { getMoodGallery } from '@/features/mood/shared/gallery';
import {
  getFirstImageMeta,
  getFirstVideoPosterSrc,
  getInlineMediaPreview,
  getQuotePreview,
  getTextPreview,
  getTextPreviewHtml,
  hasEmojiImageMedia,
  hasMedia,
  hasTooBigVideo,
  isLongContent,
} from '@/features/mood/shared/utils';
import type { ChannelInfo, Post } from '@/features/mood/server/legacy-types';
import type { MoodFeedItem, MoodFeedResponse } from './contracts';
import {
  getMoodChannelEmojiId,
  getMoodChannelSlug,
  getMoodHdImageBase,
  toMoodAvatarUrl,
  type MoodServerContext,
} from './channel-service';

function getLocalMoodId(href: string | undefined): string {
  if (!href) return '';
  try {
    const url = new URL(href, 'https://local.invalid');
    const match = url.pathname.match(/^\/mood\/(\d+)$/);
    return match?.[1] ?? '';
  } catch {
    return '';
  }
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
  const quoteTargetId = getLocalMoodId(quote?.href);
  const quoteTargetPost = quoteTargetId
    ? channelInfo.posts?.find((candidate) => candidate.id === quoteTargetId)
    : null;
  const quoteTargetVideoPoster = quoteTargetPost ? getFirstVideoPosterSrc(quoteTargetPost.content) : null;
  if (quote && quoteTargetVideoPoster) {
    quote.thumbnailSrc = quoteTargetVideoPoster;
  }
  const hasUnsupportedMedia = post.content.includes('mood-unsupported-media-card');
  const hasDetailMedia = hasUnsupportedMedia || hasMedia(post.content) || hasEmojiImageMedia(post.content);

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
    imageKind: mediaPreview ? null : imageMeta.kind,
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
