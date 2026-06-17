import type { MoodProbeResult } from '@bunizao/contracts';
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
  loadMoodComments,
  loadMoodDocument,
  loadMoodFeed,
  loadMoodProbe,
  type MoodApiSource,
} from './api-client';
import type { MoodServerContext } from './channel-service';

interface MoodApiRouteOptions {
  source: MoodApiSource;
  rateLimitPrefix: string;
}

interface MoodPostApiRouteOptions extends MoodApiRouteOptions {
  postId: string;
}

function moodFeedRateLimitPrefix(basePrefix: string, isProbe: boolean, skipCache: boolean): string {
  if (isProbe) return `${basePrefix}:probe`;
  if (skipCache) return `${basePrefix}:fresh`;
  return basePrefix;
}

export async function handleMoodFeedApiRoute(
  { request, locals }: MoodServerContext,
  { source, rateLimitPrefix }: MoodApiRouteOptions
): Promise<Response> {
  const url = new URL(request.url);
  const before = readCursorQuery(url, 'before');
  const after = readCursorQuery(url, 'after');
  const isProbe = readBooleanFlag(url, 'probe');
  const skipCache = readBooleanFlag(url, 'fresh');
  const rateLimit = withRateLimit(
    request,
    {
      windowMs: 60_000,
      max: isProbe ? 90 : skipCache ? 30 : 180,
      prefix: moodFeedRateLimitPrefix(rateLimitPrefix, isProbe, skipCache),
    },
    locals
  );

  if (!rateLimit.allowed) {
    return jsonTooManyRequests(rateLimit.headers);
  }

  if (!isValidCursor(before) || !isValidCursor(after)) {
    return jsonBadRequest('Invalid cursor parameter', rateLimit.headers);
  }

  try {
    if (isProbe) {
      const body: MoodProbeResult = await loadMoodProbe({ request, locals }, { source });
      const headers = new Headers(rateLimit.headers);
      headers.set('Cache-Control', 'no-store, max-age=0');
      return jsonOk(body, headers);
    }

    const headers = new Headers(rateLimit.headers);
    headers.set('Cache-Control', skipCache ? 'no-store, max-age=0' : 'public, max-age=0');
    const body = await loadMoodFeed({ request, locals }, {
      before,
      after,
      fresh: skipCache,
      source,
    });

    return jsonOk(body, headers);
  } catch (error) {
    console.error(`Failed to fetch ${source} mood feed:`, error);
    return json(500, { posts: [] }, rateLimit.headers);
  }
}

export async function handleMoodDocumentApiRoute(
  { request, locals }: MoodServerContext,
  { postId, source, rateLimitPrefix }: MoodPostApiRouteOptions
): Promise<Response> {
  const rateLimit = withRateLimit(
    request,
    { windowMs: 60_000, max: 120, prefix: rateLimitPrefix },
    locals
  );

  if (!rateLimit.allowed) {
    return jsonTooManyRequests(rateLimit.headers);
  }

  if (!postId) {
    return jsonBadRequest('Missing postId parameter', rateLimit.headers);
  }

  if (!isValidCursor(postId)) {
    return jsonBadRequest('Invalid postId parameter', rateLimit.headers);
  }

  try {
    const body = await loadMoodDocument({ request, locals }, postId, { source });
    if (!body) {
      return json(404, { error: 'Mood post not found' }, rateLimit.headers);
    }

    return jsonOk(body, rateLimit.headers);
  } catch (error) {
    console.error(`Failed to fetch ${source} mood post:`, error);
    return json(500, { error: 'Failed to fetch mood post' }, rateLimit.headers);
  }
}

export async function handleMoodCommentsApiRoute(
  { request, locals }: MoodServerContext,
  { postId, source, rateLimitPrefix }: MoodPostApiRouteOptions
): Promise<Response> {
  const rateLimit = withRateLimit(
    request,
    { windowMs: 60_000, max: 90, prefix: rateLimitPrefix },
    locals
  );
  if (!rateLimit.allowed) {
    return jsonTooManyRequests(rateLimit.headers);
  }

  const url = new URL(request.url);
  const before = readCursorQuery(url, 'before');

  if (!postId) {
    return jsonBadRequest('Missing postId parameter', rateLimit.headers);
  }

  if (!isValidCursor(postId)) {
    return jsonBadRequest('Invalid postId parameter', rateLimit.headers);
  }

  if (!isValidCursor(before)) {
    return jsonBadRequest('Invalid before parameter', rateLimit.headers);
  }

  try {
    const body = await loadMoodComments({ request, locals }, postId, { before, source });
    return json(200, body, rateLimit.headers);
  } catch (error) {
    console.error(`Failed to fetch ${source} mood comments:`, error);
    return json(500, { comments: [], hasMore: false, nextBefore: '' }, rateLimit.headers);
  }
}
