import type {
  MediaItem,
  MoodCommentsPage,
  MoodContentDocument,
  MoodFeedItem,
  MoodFeedResponse,
  MoodProbeResult,
} from '@bunizao/contracts';
import { isE2ESiteFixtureEnabled } from '@/lib/e2e';
import {
  createE2EChannelInfo,
  createE2EPost,
} from './e2e-fixtures';
import {
  buildMoodFeedResponse,
  buildMoodFeedItem,
} from './feed-service';
import { getMoodGallery } from '../shared/gallery';
import {
  loadMoodChannelSnapshot,
  loadMoodPostSnapshot,
  loadMoodCommentsFixture,
  getMoodChannelSlug,
  type MoodServerContext,
} from './channel-service';
import { getPostComments } from './telegram-source';

export interface MoodFeedQuery {
  before?: string;
  after?: string;
  fresh?: boolean;
  limit?: number;
  useApiV2?: boolean;
}

export interface MoodCommentsQuery {
  before?: string;
  limit?: number;
  useApiV2?: boolean;
}

export interface MoodDocumentQuery {
  useApiV2?: boolean;
}

function imageMediaItems(media: readonly MediaItem[]): MediaItem[] {
  return media.filter((item) => item.type === 'image' && item.src);
}

function firstPreviewImage(media: readonly MediaItem[]): MediaItem | null {
  return media.find((item) => (item.type === 'image' || item.type === 'sticker') && item.src) ?? null;
}

function e2ePostMedia(postContent: string): MediaItem[] {
  const gallery = getMoodGallery(postContent);
  return gallery?.items.map((item, index) => ({
    id: `e2e-${index}`,
    type: 'image',
    src: item.src,
    fallbackSrc: item.fallbackSrc,
    width: item.width,
    height: item.height,
    layout: item.layout,
    alt: item.alt,
  })) ?? [];
}

function legacyPostMedia(postContent: string): MediaItem[] {
  const gallery = getMoodGallery(postContent);
  return gallery?.items.map((item, index) => ({
    id: `legacy-${index}`,
    type: 'image',
    src: item.src,
    fallbackSrc: item.fallbackSrc,
    width: item.width,
    height: item.height,
    layout: item.layout,
    alt: item.alt,
  })) ?? [];
}

export async function loadMoodFeed(
  context: MoodServerContext,
  query: MoodFeedQuery = {},
): Promise<MoodFeedResponse> {
  if (isE2ESiteFixtureEnabled(context.locals)) {
    const channelInfo = createE2EChannelInfo();
    return buildMoodFeedResponse(context, channelInfo, channelInfo.posts);
  }

  // D1 stays useful for indexing and ingestion, but production mood rendering
  // still depends on Telegram widget HTML for link previews, files, video
  // fallbacks, and reply cards.
  const { channelInfo, posts } = await loadMoodChannelSnapshot(context, {
    before: query.before,
    after: query.after,
    skipCache: query.fresh,
  });
  const limitedPosts = typeof query.limit === 'number' ? posts.slice(0, query.limit) : posts;
  return buildMoodFeedResponse(context, channelInfo, limitedPosts);
}

export async function loadMoodProbe(context: MoodServerContext, _options: { useApiV2?: boolean } = {}): Promise<MoodProbeResult> {
  if (isE2ESiteFixtureEnabled(context.locals)) {
    const channelInfo = createE2EChannelInfo();
    return { latestId: channelInfo.posts[0]?.id ?? '' };
  }

  const { posts } = await loadMoodChannelSnapshot(context, { skipCache: true });
  return { latestId: posts[0]?.id ?? '' };
}

export async function loadMoodDocument(
  context: MoodServerContext,
  id: string,
  _query: MoodDocumentQuery = {},
): Promise<MoodContentDocument | null> {
  if (isE2ESiteFixtureEnabled(context.locals)) {
    const post = createE2EPost(id);
    return {
      id: post.id,
      source: 'mood',
      datetime: post.datetime,
      tag: post.tags[0],
      bodyHtml: post.content,
      previewText: post.text,
      previewHtml: post.text,
      hero: null,
      media: e2ePostMedia(post.content),
      forwardedFrom: post.forwardedFrom ?? null,
      quote: null,
      reactions: post.reactions,
      commentsCount: post.commentsCount ?? 0,
      channel: {
        slug: 'tutumood',
        title: 'Levitating',
      },
    };
  }

  const { post, channelInfo } = await loadMoodPostSnapshot(context, id);
  if (!post) return null;
  const feedItem = channelInfo ? await buildMoodFeedItem(context, post, channelInfo) : null;
  const media = legacyPostMedia(post.content);

  return {
    id: post.id,
    source: 'mood',
    datetime: post.datetime,
    tag: post.tags[0],
    bodyHtml: post.content,
    previewText: post.text,
    previewHtml: feedItem?.previewHtml ?? post.text,
    hero: media[0] ?? null,
    media,
    forwardedFrom: post.forwardedFrom ?? null,
    quote: feedItem?.quote ?? null,
    reactions: feedItem?.reactions ?? post.reactions,
    commentsCount: post.commentsCount ?? 0,
    channel: {
      slug: getMoodChannelSlug(context.locals) || undefined,
      title: channelInfo?.title,
    },
  };
}

export async function loadMoodComments(
  context: MoodServerContext,
  postId: string,
  query: MoodCommentsQuery = {},
): Promise<MoodCommentsPage> {
  if (isE2ESiteFixtureEnabled(context.locals)) {
    return loadMoodCommentsFixture(postId);
  }

  const result = await getPostComments(
    { request: context.request, locals: context.locals } as any,
    {
      postId,
      before: query.before ?? '',
    }
  );

  return {
    comments: result.comments.map((comment) => ({
      id: comment.id,
      author: comment.author,
      authorAvatar: comment.authorAvatar,
      datetime: comment.datetime,
      content: comment.content,
      reactions: comment.reactions.map((reaction) => ({
        emoji: reaction.emoji,
        emojiId: reaction.emojiId,
        emojiImage: reaction.emojiImage,
        count: reaction.count,
        isPaid: reaction.isPaid,
      })),
    })),
    hasMore: result.hasMore,
    nextBefore: result.nextBefore || '',
  };
}

export function moodDocumentToFeedItem(document: MoodContentDocument): MoodFeedItem {
  const imageItems = imageMediaItems(document.media);
  const previewImage = firstPreviewImage(document.media);

  return {
    id: document.id,
    datetime: document.datetime,
    tag: document.tag ?? '',
    previewText: document.previewText ?? '',
    previewHtml: document.previewHtml ?? document.bodyHtml,
    previewMediaType: document.hero?.type,
    gallery: imageItems.length > 0
      ? {
          count: imageItems.length,
          items: imageItems.map((item) => ({
            src: item.src ?? '',
            fallbackSrc: item.fallbackSrc ?? null,
            width: item.width ?? null,
            height: item.height ?? null,
            layout: item.layout ?? null,
            alt: item.alt ?? '',
          })),
        }
      : null,
    image: previewImage?.src ?? null,
    imageFallback: previewImage?.fallbackSrc ?? null,
    imageWidth: previewImage?.width ?? null,
    imageHeight: previewImage?.height ?? null,
    imageLayout: previewImage?.layout ?? null,
    imageKind: previewImage?.type === 'sticker' ? 'sticker' : null,
    mediaHtml: '',
    needsDetailPage: document.media.length > 1,
    forwardedFrom: document.forwardedFrom ?? null,
    quote: document.quote ?? null,
    reactions: document.reactions ?? [],
    commentsCount: document.commentsCount ?? 0,
  };
}
