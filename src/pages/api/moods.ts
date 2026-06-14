import type { APIRoute } from 'astro';
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
  loadMoodFeed,
  loadMoodProbe,
} from '@/features/mood/server/api-client';
import type { MoodProbeResult } from '@/features/mood/server/contracts';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const before = readCursorQuery(url, 'before');
  const after = readCursorQuery(url, 'after');
  const isProbe = readBooleanFlag(url, 'probe');
  const skipCache = readBooleanFlag(url, 'fresh');
  const useApiV2 = readBooleanFlag(url, 'api-v2');
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

  try {
    if (isProbe) {
      const body: MoodProbeResult = await loadMoodProbe({ request, locals }, { useApiV2 });
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
      useApiV2,
    });

    return jsonOk(body, headers);
  } catch (error) {
    console.error('Failed to fetch moods:', error);
    return json(500, { posts: [] }, rateLimit.headers);
  }
};
