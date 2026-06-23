import type {
  MediaItem,
  MoodCommentsPage,
  MoodFeedQuery as MoodArchiveFeedQuery,
  MoodContentDocument,
  MoodFeedItem,
  MoodFeedResponse,
  MoodProbeResult,
} from '@bunizao/contracts';
import {
  createApiServiceRequest,
  getApiServiceBinding,
} from '@/lib/http/api-service-proxy';
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
import {
  MOOD_RICH_TEXT_FIXTURE_ID,
  buildMoodRichTextFixtureDocument,
  isMoodRichTextFixtureEnabled,
} from './rich-text-fixture';

export interface MoodFeedQuery extends MoodArchiveFeedQuery {
  before?: string;
  after?: string;
  fresh?: boolean;
  limit?: number;
  source?: MoodApiSource;
}

export interface MoodCommentsQuery {
  before?: string;
  limit?: number;
  source?: MoodApiSource;
}

export interface MoodDocumentQuery {
  source?: MoodApiSource;
}

export type MoodApiSource = 'live' | 'archive';

type MoodArchiveApiPath = `/v2/mood${string}`;

function createMoodArchiveApiRequest(context: MoodServerContext, path: MoodArchiveApiPath, params: URLSearchParams = new URLSearchParams()): Request {
  const source = new URL(context.request.url);
  source.pathname = path;
  source.search = params.toString();
  return createApiServiceRequest(new Request(source, {
    method: 'GET',
    headers: context.request.headers,
  }));
}

async function fetchMoodArchiveApiJson<T>(
  context: MoodServerContext,
  path: MoodArchiveApiPath,
  params: URLSearchParams = new URLSearchParams(),
): Promise<T> {
  const api = await getApiServiceBinding(context.locals);
  if (!api) {
    throw new Error('API service binding unavailable for mood archive reads.');
  }

  const response = await api.fetch(createMoodArchiveApiRequest(context, path, params));
  if (!response.ok) {
    throw new Error(`Mood archive request failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

function moodFeedParams(query: MoodFeedQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.before) params.set('before', query.before);
  if (query.after) params.set('after', query.after);
  if (query.fresh) params.set('fresh', 'true');
  if (typeof query.limit === 'number') params.set('limit', String(query.limit));
  if (query.tag) params.set('tag', query.tag);
  return params;
}

function moodCommentsParams(query: MoodCommentsQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.before) params.set('before', query.before);
  if (typeof query.limit === 'number') params.set('limit', String(query.limit));
  return params;
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

  if (isMoodRichTextFixtureEnabled(context.locals)) {
    const document = buildMoodRichTextFixtureDocument(getMoodChannelSlug(context.locals));
    return {
      posts: [moodDocumentToFeedItem(document)],
      channel: { slug: document.channel?.slug, title: document.channel?.title },
    };
  }

  if (query.source === 'archive') {
    return fetchMoodArchiveApiJson<MoodFeedResponse>(context, '/v2/mood', moodFeedParams(query));
  }

  const { channelInfo, posts } = await loadMoodChannelSnapshot(context, {
    before: query.before,
    after: query.after,
    skipCache: query.fresh,
  });
  const limitedPosts = typeof query.limit === 'number' ? posts.slice(0, query.limit) : posts;
  return buildMoodFeedResponse(context, channelInfo, limitedPosts);
}

export async function loadMoodProbe(context: MoodServerContext, options: { source?: MoodApiSource } = {}): Promise<MoodProbeResult> {
  if (isE2ESiteFixtureEnabled(context.locals)) {
    const channelInfo = createE2EChannelInfo();
    return { latestId: channelInfo.posts[0]?.id ?? '' };
  }

  if (isMoodRichTextFixtureEnabled(context.locals)) {
    return { latestId: MOOD_RICH_TEXT_FIXTURE_ID };
  }

  if (options.source === 'archive') {
    const params = new URLSearchParams({ probe: 'true', fresh: 'true' });
    return fetchMoodArchiveApiJson<MoodProbeResult>(context, '/v2/mood', params);
  }

  const { posts } = await loadMoodChannelSnapshot(context, { skipCache: true });
  return { latestId: posts[0]?.id ?? '' };
}

export async function loadMoodDocument(
  context: MoodServerContext,
  id: string,
  query: MoodDocumentQuery = {},
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

  if (isMoodRichTextFixtureEnabled(context.locals) && id === MOOD_RICH_TEXT_FIXTURE_ID) {
    return buildMoodRichTextFixtureDocument(getMoodChannelSlug(context.locals));
  }

  if (query.source === 'archive') {
    return fetchMoodArchiveApiJson<MoodContentDocument | null>(context, `/v2/mood/${encodeURIComponent(id)}`);
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

  if (isMoodRichTextFixtureEnabled(context.locals)) {
    return { comments: [], hasMore: false, nextBefore: '' };
  }

  if (query.source === 'archive') {
    return fetchMoodArchiveApiJson<MoodCommentsPage>(
      context,
      `/v2/mood/${encodeURIComponent(postId)}/comments`,
      moodCommentsParams(query),
    );
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
    media: document.media,
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
