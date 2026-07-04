import type { APIContext } from 'astro';
import { loadMoodComments, loadMoodFeed, loadMoodProbe } from '@/features/mood/server/api-client';
import { json, jsonBadRequest, jsonError, jsonOk } from '@/lib/http/json-response';
import {
  API_PREFIX,
  HEALTH_PATH,
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
    return jsonOk(await loadMoodProbe(context), noStore());
  }

  return jsonOk(await loadMoodFeed(context, {
    before: before ?? undefined,
    fresh: url.searchParams.get('fresh') === '1',
  }), noStore());
}

async function commentsFixtureResponse(context: FixtureContext, url: URL): Promise<Response> {
  const postId = url.searchParams.get('postId');
  if (!postId) {
    return jsonBadRequest('Missing postId', noStore());
  }
  if (!isNumericId(postId)) {
    return jsonBadRequest('Invalid postId', noStore());
  }

  return jsonOk(await loadMoodComments(context, postId, {
    before: url.searchParams.get('before') ?? undefined,
  }), noStore());
}

function healthFixtureResponse(url: URL): Response {
  if (url.searchParams.get('diagnostic') === '1') {
    return jsonOk({
      status: 'ok',
      mode: url.searchParams.get('deep') === '1' ? 'deep' : 'diagnostic',
      checkedAt: new Date(0).toISOString(),
      checks: [
        {
          id: 'mood-image-worker',
          label: 'Mood image worker',
          status: 'ok',
          critical: true,
          durationMs: 1,
        },
      ],
    }, noStore());
  }

  return jsonOk({
    status: 'ok',
    mode: 'ping',
    checkedAt: new Date(0).toISOString(),
    diagnostic: '/api/health?diagnostic=1',
  }, noStore());
}

function oembedFixtureResponse(request: Request, url: URL): Response {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: noStore({
        Allow: 'GET, OPTIONS',
      }),
    });
  }

  const rawUrl = url.searchParams.get('url');
  if (!rawUrl) {
    return jsonBadRequest('Missing url', noStore());
  }

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return jsonBadRequest('Invalid url', noStore());
  }

  if (target.host !== url.host) {
    return jsonError(403, 'Forbidden url host', noStore());
  }

  const path = target.pathname.replace(/\/+$/, '') || '/';
  if (path !== '/mood' && !/^\/mood\/\d+$/.test(path)) {
    return jsonError(404, 'Unsupported oEmbed url', noStore());
  }

  const idMatch = path.match(/^\/mood\/(\d+)$/);
  const params = new URLSearchParams({ count: '3' });
  if (idMatch) params.set('id', idMatch[1]);
  const src = `/mood/embed?${params.toString()}`;

  return jsonOk({
    type: 'rich',
    version: '1.0',
    title: idMatch ? `Mood ${idMatch[1]}` : 'Mood Feed',
    width: 400,
    height: 520,
    html: `<iframe src="${src}" title="Mood Embed"></iframe>`,
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

function adminAuthStartFixtureResponse(url: URL): Response {
  const next = url.searchParams.get('next');
  const location = next?.startsWith('/') && !next.startsWith('//') ? next : '/dev/portal';

  return new Response(null, {
    status: 302,
    headers: noStore({
      Location: location,
    }),
  });
}

export async function createE2EApiFixtureResponse(context: FixtureContext): Promise<Response | null> {
  const url = new URL(context.request.url);
  if (url.pathname === '/api/footer') {
    return footerFixtureResponse();
  }
  if (url.pathname === '/api/edge') {
    return edgeFixtureResponse();
  }
  if (
    url.pathname === '/api/listening'
    || url.pathname === '/api/v2/listening'
    || url.pathname === '/v2/listening'
  ) {
    return listeningFixtureResponse();
  }
  if (url.pathname === '/api/v2/musickit/token' || url.pathname === '/v2/musickit/token') {
    return musickitTokenFixtureResponse();
  }
  if (url.pathname === '/v2/admin/auth/start') {
    return adminAuthStartFixtureResponse(url);
  }
  if (url.pathname === MOOD_PUBLIC_FEED_PATH) {
    return moodFixtureResponse(context, url);
  }
  if (url.pathname === MOOD_PUBLIC_COMMENTS_PATH) {
    return commentsFixtureResponse(context, url);
  }
  if (url.pathname === `${API_PREFIX}${HEALTH_PATH}`) {
    return healthFixtureResponse(url);
  }
  if (url.pathname === '/api/oembed.json') {
    return oembedFixtureResponse(context.request, url);
  }
  if (url.pathname === '/api/status.svg') {
    return svgFixtureResponse('Status');
  }
  if (url.pathname === '/api/tech-stack.svg') {
    return svgFixtureResponse('Tech Stack');
  }
  if (url.pathname === '/api/site-badge.svg') {
    return svgFixtureResponse('Site Badge');
  }
  if (url.pathname === '/api/project.svg') {
    if (url.searchParams.get('project') === 'does-not-exist') {
      return json(404, { error: 'Project not found' }, noStore());
    }
    return svgFixtureResponse('Project');
  }

  return null;
}
