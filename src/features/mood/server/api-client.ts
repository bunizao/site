import type {
  MediaItem,
  MoodCommentsPage,
  MoodContentDocument,
  MoodFeedItem,
  MoodFeedResponse,
  MoodProbeResult,
} from '@bunizao/contracts';
import { MOOD_ARCHIVE_FEED_PATH } from '@bunizao/contracts/routes';
import {
  createApiServiceRequest,
  getApiServiceBinding,
  resolveDevApiOrigin,
} from '@/lib/http/api-service-proxy';
import { isE2ESiteFixtureEnabled } from '@/lib/e2e';
import { readOptionalEnv, type RuntimeEnvLocals } from '@/lib/runtime/env';
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
  toMoodAvatarUrl,
  type MoodServerContext,
} from './channel-service';
import { getPostComments } from './telegram-source';
import {
  MOOD_RICH_TEXT_FIXTURE_ID,
  buildMoodRichTextFixtureDocument,
  isMoodRichTextFixtureEnabled,
} from './rich-text-fixture';

export interface MoodFeedQuery {
  before?: string;
  after?: string;
  fresh?: boolean;
  fallback?: boolean;
  limit?: number;
  source?: MoodApiSource;
  tag?: string;
}

export interface MoodCommentsQuery {
  before?: string;
  limit?: number;
  source?: MoodApiSource;
}

export interface MoodDocumentQuery {
  fallback?: boolean;
  source?: MoodApiSource;
}

export type MoodApiSource = 'live' | 'archive';

type MoodArchiveApiPath = `${typeof MOOD_ARCHIVE_FEED_PATH}${string}`;
const DEFAULT_MOOD_API_SOURCE: MoodApiSource = 'live';

export function normalizeMoodApiSource(value: unknown): MoodApiSource | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized === 'live' || normalized === 'archive' ? normalized : null;
}

export function resolveMoodReadSource(
  locals: RuntimeEnvLocals | undefined,
  source?: MoodApiSource,
): MoodApiSource {
  return source
    ?? normalizeMoodApiSource(readOptionalEnv(locals, 'MOOD_READ_SOURCE'))
    ?? DEFAULT_MOOD_API_SOURCE;
}

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
  if (api) {
    const response = await api.fetch(createMoodArchiveApiRequest(context, path, params));
    if (!response.ok) {
      throw new Error(`Mood archive request failed: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<T>;
  }

  // Dev-only: no service binding under `astro dev`, so hit the archive route
  // over HTTP (buxx.me by default, or API_DEV_ORIGIN). Production always has
  // the binding, so this branch is never reached there. Public origins route
  // the archive API under /api/v2, redirecting bare /v2, so prefix /api here.
  const devOrigin = resolveDevApiOrigin(context.locals);
  if (!devOrigin) {
    throw new Error('API service binding unavailable for mood archive reads.');
  }

  const source = new URL(context.request.url);
  source.pathname = `/api${path}`;
  source.search = params.toString();
  // Strip the browser's Accept-Encoding: undici only auto-decompresses when it
  // sets that header itself, so forwarding gzip/br leaves .json() reading raw
  // compressed bytes ("Unexpected token" parse errors).
  const headers = new Headers(context.request.headers);
  headers.delete('accept-encoding');
  const response = await fetch(createApiServiceRequest(new Request(source, {
    method: 'GET',
    headers,
  }), devOrigin));
  if (!response.ok) {
    throw new Error(`Mood archive request failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export async function loadMoodArchiveWithFallback<T>(
  resource: string,
  loadArchive: () => Promise<T>,
  loadLive: () => Promise<T>,
): Promise<T> {
  try {
    return await loadArchive();
  } catch (error) {
    console.warn(`Mood archive ${resource} failed; falling back to live reader.`, error);
    return loadLive();
  }
}

function moodFeedParams(query: MoodFeedQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.before) params.set('before', query.before);
  if (query.after) params.set('after', query.after);
  if (query.tag) params.set('tag', query.tag);
  if (query.fresh) params.set('fresh', 'true');
  if (typeof query.limit === 'number') params.set('limit', String(query.limit));
  if (query.fallback === false) params.set('fallback', '0');
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
  // Tag filtering only exists on the archive route: force archive, no live fallback.
  const source = query.tag ? 'archive' : resolveMoodReadSource(context.locals, query.source);

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

  if (source === 'archive') {
    // Live fallback is the availability net: any unfiltered archive failure
    // (D1 quota, binding outage, 5xx) degrades to the bounded Telegram reader.
    // Tag filters only exist on the archive, so they stay strict. The
    // `fallback=0` sent to site-api is a separate policy: it keeps t.me
    // content completion off the archive read path.
    const fallback = query.fallback !== false && !query.tag;
    const loadArchive = () => fetchMoodArchiveApiJson<MoodFeedResponse>(
      context,
      MOOD_ARCHIVE_FEED_PATH,
      moodFeedParams({ ...query, fallback: false }),
    );
    if (!fallback) {
      return loadArchive();
    }

    return loadMoodArchiveWithFallback(
      'feed',
      loadArchive,
      async () => {
        const { channelInfo, posts } = await loadMoodChannelSnapshot(context, {
          before: query.before,
          after: query.after,
          skipCache: query.fresh,
        });
        const limitedPosts = typeof query.limit === 'number' ? posts.slice(0, query.limit) : posts;
        return buildMoodFeedResponse(context, channelInfo, limitedPosts);
      },
    );
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

  const source = resolveMoodReadSource(context.locals, options.source);
  if (source === 'archive') {
    const params = new URLSearchParams({ probe: 'true', fresh: 'true' });
    return loadMoodArchiveWithFallback(
      'probe',
      () => fetchMoodArchiveApiJson<MoodProbeResult>(context, MOOD_ARCHIVE_FEED_PATH, params),
      async () => {
        const { posts } = await loadMoodChannelSnapshot(context, { skipCache: true });
        return { latestId: posts[0]?.id ?? '' };
      },
    );
  }

  const { posts } = await loadMoodChannelSnapshot(context, { skipCache: true });
  return { latestId: posts[0]?.id ?? '' };
}

export async function loadMoodDocument(
  context: MoodServerContext,
  id: string,
  query: MoodDocumentQuery = {},
): Promise<MoodContentDocument | null> {
  const source = resolveMoodReadSource(context.locals, query.source);

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

  if (source === 'archive') {
    const fallback = query.fallback !== false;
    const params = new URLSearchParams({ fallback: '0' });
    const loadArchive = () => fetchMoodArchiveApiJson<MoodContentDocument | null>(
      context,
      `${MOOD_ARCHIVE_FEED_PATH}/${encodeURIComponent(id)}`,
      params,
    );
    if (!fallback) {
      return loadArchive();
    }

    return loadMoodArchiveWithFallback(
      'detail',
      loadArchive,
      async () => {
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
            avatar: toMoodAvatarUrl(channelInfo?.avatar || '', context.locals) || undefined,
          },
        };
      },
    );
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
      avatar: toMoodAvatarUrl(channelInfo?.avatar || '', context.locals) || undefined,
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
    return loadMoodArchiveWithFallback(
      'comments',
      () => fetchMoodArchiveApiJson<MoodCommentsPage>(
        context,
        `${MOOD_ARCHIVE_FEED_PATH}/${encodeURIComponent(postId)}/comments`,
        moodCommentsParams(query),
      ),
      async () => {
        const result = await getPostComments(
          { request: context.request, locals: context.locals } as any,
          { postId, before: query.before ?? '' },
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
      },
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
    ...(document.groupIds ? { groupIds: document.groupIds } : {}),
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
