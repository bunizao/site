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
  API_SERVICE_BINDING_ORIGIN,
  getApiServiceBinding,
} from '@/lib/http/api-service-proxy';
import {
  createE2EChannelInfo,
  createE2EComments,
  createE2EPost,
} from './e2e-fixtures';
import { buildMoodFeedResponse } from './feed-service';
import { getMoodGallery } from '../shared/gallery';
import type { MoodServerContext } from './channel-service';

export interface MoodFeedQuery {
  before?: string;
  after?: string;
  fresh?: boolean;
  limit?: number;
}

export interface MoodCommentsQuery {
  before?: string;
  limit?: number;
}

function appendSearchParams(url: URL, values: Record<string, string | number | boolean | undefined>): void {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === false || value === '') continue;
    url.searchParams.set(key, value === true ? '1' : String(value));
  }
}

function createApiRequest(context: MoodServerContext, path: string): Request {
  const headers = new Headers({
    Accept: 'application/json',
  });
  const source = new URL(context.request.url);

  headers.set('X-Forwarded-Host', source.host);
  headers.set('X-Forwarded-Proto', source.protocol.replace(':', ''));
  headers.set('X-Forwarded-Origin', source.origin);
  headers.set('X-Buxx-Forwarded-Url', source.toString());

  return new Request(new URL(path, API_SERVICE_BINDING_ORIGIN), {
    headers,
  });
}

async function fetchMoodApi(context: MoodServerContext, path: string): Promise<Response> {
  const api = await getApiServiceBinding(context.locals);
  if (!api) {
    throw new Error('API service binding unavailable');
  }

  return api.fetch(createApiRequest(context, path));
}

async function readApiJson<T>(response: Response, label: string): Promise<T> {
  if (!response.ok) {
    throw new Error(`${label} failed with ${response.status}`);
  }
  return await response.json() as T;
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

export async function loadMoodFeed(
  context: MoodServerContext,
  query: MoodFeedQuery = {},
): Promise<MoodFeedResponse> {
  if (isE2ESiteFixtureEnabled(context.locals)) {
    const channelInfo = createE2EChannelInfo();
    return buildMoodFeedResponse(context, channelInfo, channelInfo.posts);
  }

  const url = new URL('/v1/mood', API_SERVICE_BINDING_ORIGIN);
  appendSearchParams(url, {
    before: query.before,
    after: query.after,
    fresh: query.fresh,
    limit: query.limit,
  });
  const response = await fetchMoodApi(context, `${url.pathname}${url.search}`);
  return readApiJson<MoodFeedResponse>(response, 'Mood feed');
}

export async function loadMoodProbe(context: MoodServerContext): Promise<MoodProbeResult> {
  if (isE2ESiteFixtureEnabled(context.locals)) {
    const channelInfo = createE2EChannelInfo();
    return { latestId: channelInfo.posts[0]?.id ?? '' };
  }

  const response = await fetchMoodApi(context, '/v1/mood?probe=1&fresh=1');
  return readApiJson<MoodProbeResult>(response, 'Mood probe');
}

export async function loadMoodDocument(
  context: MoodServerContext,
  id: string,
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

  const response = await fetchMoodApi(context, `/v1/mood/${encodeURIComponent(id)}`);
  if (response.status === 404) return null;
  return readApiJson<MoodContentDocument>(response, 'Mood document');
}

export async function loadMoodComments(
  context: MoodServerContext,
  postId: string,
  query: MoodCommentsQuery = {},
): Promise<MoodCommentsPage> {
  if (isE2ESiteFixtureEnabled(context.locals)) {
    return createE2EComments(postId) as MoodCommentsPage;
  }

  const url = new URL(`/v1/mood/${encodeURIComponent(postId)}/comments`, API_SERVICE_BINDING_ORIGIN);
  appendSearchParams(url, {
    before: query.before,
    limit: query.limit,
  });
  const response = await fetchMoodApi(context, `${url.pathname}${url.search}`);
  return readApiJson<MoodCommentsPage>(response, 'Mood comments');
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
