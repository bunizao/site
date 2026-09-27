import type { APIContext } from 'astro';
import { loadMoodFeed } from '@/features/mood/server/api-client';
import { loadMoodCommentsFixture } from '@/features/mood/server/channel-service';
import { createE2EChannelInfo } from '@/features/mood/server/e2e-fixtures';
import { jsonBadRequest, jsonOk } from '@/lib/http/json-response';
import {
  API_PREFIX,
  MOOD_LIVE_COUNTS_PATH,
  MOOD_PUBLIC_COMMENTS_PATH,
  MOOD_PUBLIC_FEED_PATH,
} from '@bunizao/contracts/routes';

type FixtureContext = Pick<APIContext, 'request' | 'locals'>;

function isNumericId(value: string | null): value is string {
  return Boolean(value && /^\d+$/.test(value));
}

function noStore(headers?: HeadersInit): Headers {
  const next = new Headers(headers);
  next.set('Cache-Control', 'no-store, max-age=0');
  return next;
}

async function moodFixtureResponse(context: FixtureContext, url: URL): Promise<Response> {
  const before = url.searchParams.get('before');
  if (before !== null && !isNumericId(before)) {
    return jsonBadRequest('Invalid cursor', noStore());
  }

  if (url.searchParams.get('probe') === '1') {
    return jsonOk({ latestId: createE2EChannelInfo().posts[0]?.id ?? '' }, noStore());
  }

  return jsonOk(await loadMoodFeed(context, {
    before: before ?? undefined,
    fresh: url.searchParams.get('fresh') === '1',
  }), noStore());
}

function commentsFixtureResponse(url: URL): Response {
  const postId = url.searchParams.get('postId');
  if (!postId) {
    return jsonBadRequest('Missing postId', noStore());
  }
  if (!isNumericId(postId)) {
    return jsonBadRequest('Invalid postId', noStore());
  }

  return jsonOk(loadMoodCommentsFixture(postId), noStore());
}

function liveCountsFixtureResponse(url: URL): Response {
  const ids = (url.searchParams.get('ids') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => /^\d+$/.test(id));

  return jsonOk({
    counts: Object.fromEntries(ids.map((id) => [id, {
      commentsCount: null,
      reactions: null,
    }])),
  }, noStore());
}

function svgFixtureResponse(title: string): Response {
  const safeTitle = title.replace(/[<>&"]/g, '');
  const body = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="80" viewBox="0 0 320 80">',
    `<title>${safeTitle}</title>`,
    '<rect width="320" height="80" fill="#111827"/>',
    `<text x="24" y="48" fill="#f9fafb" font-family="system-ui, sans-serif" font-size="20">${safeTitle}</text>`,
    '</svg>',
  ].join('');

  return new Response(body, {
    headers: noStore({
      'Content-Type': 'image/svg+xml; charset=utf-8',
    }),
  });
}

function footerFixtureResponse(): Response {
  return jsonOk({ status: 'operational' }, noStore({
    'X-Cloudflare-Colo': 'SFO',
  }));
}

function edgeFixtureResponse(): Response {
  return jsonOk({
    colo: 'SFO',
    country: 'US',
    city: 'San Francisco',
    region: 'California',
    protocol: 'HTTP/3',
    tls: 'TLSv1.3',
    rtt: 42,
    network: 'E2E',
  }, noStore());
}

function listeningFixtureResponse(): Response {
  return jsonOk({
    configured: true,
    source: 'e2e',
    track: null,
  }, noStore());
}

function musickitTokenFixtureResponse(): Response {
  return jsonOk({}, noStore());
}

export async function createE2EApiFixtureResponse(context: FixtureContext): Promise<Response | null> {
  const url = new URL(context.request.url);
  if (url.pathname === '/api/footer') {
    return footerFixtureResponse();
  }
  if (url.pathname === '/api/edge') {
    return edgeFixtureResponse();
  }
  if (url.pathname === '/api/listening' || url.pathname === '/api/v2/listening') {
    return listeningFixtureResponse();
  }
  if (url.pathname === '/api/musickit/token' || url.pathname === '/api/v2/musickit/token') {
    return musickitTokenFixtureResponse();
  }
  if (url.pathname === MOOD_PUBLIC_FEED_PATH || url.pathname === '/api/v2/mood') {
    return moodFixtureResponse(context, url);
  }
  if (url.pathname === `${API_PREFIX}${MOOD_LIVE_COUNTS_PATH}`) {
    return liveCountsFixtureResponse(url);
  }
  if (url.pathname === MOOD_PUBLIC_COMMENTS_PATH) {
    return commentsFixtureResponse(url);
  }

  return null;
}
