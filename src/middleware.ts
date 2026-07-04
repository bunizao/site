import { defineMiddleware } from 'astro:middleware';
import { getDocsVisibilityFromContent } from '@/features/docs/server/content';
import { isDocsPath } from '@/features/docs/server/visibility';
import { readCloudflareAccessIdentity } from '@/features/admin/server/access';
import { redirectLegacyGhostHost } from '@/lib/http/legacy-ghost-redirect';
import type { RuntimeEnvLocals } from '@/lib/runtime/env';
import {
  readAdminDevBypassSession,
  type AdminSessionIdentity,
} from '@/features/admin/server/dev-bypass';

const DEV_PORTAL_PREFIX = '/dev';
const MOOD_PAGE_CACHE_TTL_SECONDS = 60;
const MOOD_PAGE_CACHE_VERSION = '1';
const MOOD_PAGE_CACHE_HEADER = 'X-Buxx-Mood-Page-Cache';
const MOOD_PAGE_CACHE_READY_MARKERS = [
  'data-mood-initial-feed',
  'data-mood-id=',
];

function appendCacheControlDirective(value: string | null, directive: string): string {
  const current = value?.trim();
  if (!current) return directive;
  if (new RegExp(`(?:^|,)\\s*${directive}\\b`, 'i').test(current)) return current;
  return `${current}, ${directive}`;
}

function isDevPortalPath(pathname: string): boolean {
  return pathname === DEV_PORTAL_PREFIX || pathname.startsWith(`${DEV_PORTAL_PREFIX}/`);
}

export function createHtmlScriptCsp(origin: string): string {
  const cleanOrigin = origin.replace(/\/+$/, '');

  return [
    `script-src 'unsafe-inline' ${cleanOrigin}/_astro/ https://js-cdn.music.apple.com https://static.cloudflareinsights.com https://challenges.cloudflare.com http://localhost:* http://127.0.0.1:*`,
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; ');
}

function withHtmlSecurityHeaders(request: Request, response: Response): Response {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('text/html')) {
    return response;
  }

  const headers = new Headers(response.headers);
  const url = new URL(request.url);
  headers.set('Content-Security-Policy', createHtmlScriptCsp(url.origin));
  headers.set('Cache-Control', appendCacheControlDirective(headers.get('Cache-Control'), 'no-transform'));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function getEdgeCache(): Cache | undefined {
  return (globalThis as { caches?: { default?: Cache } }).caches?.default;
}

function isCacheableMoodPageRequest(request: Request): boolean {
  if (request.method !== 'GET') return false;

  const url = new URL(request.url);
  if (url.pathname !== '/mood' || url.search) return false;

  const accept = request.headers.get('accept') ?? '';
  if (accept && !accept.toLowerCase().includes('text/html')) return false;

  const cacheControl = request.headers.get('cache-control') ?? '';
  if (/\bno-cache\b|\bno-store\b/i.test(cacheControl)) return false;

  const pragma = request.headers.get('pragma') ?? '';
  return !/\bno-cache\b/i.test(pragma);
}

function createMoodPageCacheRequest(request: Request): Request {
  const url = new URL(request.url);
  const key = new URL('https://mood-page-cache.internal/feed');
  key.searchParams.set('origin', url.origin);
  key.searchParams.set('v', MOOD_PAGE_CACHE_VERSION);
  return new Request(key);
}

function withMoodPageCacheHeader(response: Response, value: 'HIT' | 'MISS' | 'BYPASS'): Response {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'public, max-age=0, s-maxage=60, no-transform');
  headers.set(MOOD_PAGE_CACHE_HEADER, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function readCachedMoodPage(request: Request): Promise<Response | null> {
  const edgeCache = getEdgeCache();
  if (!edgeCache || !isCacheableMoodPageRequest(request)) return null;

  try {
    const cached = await edgeCache.match(createMoodPageCacheRequest(request));
    return cached ? withMoodPageCacheHeader(cached, 'HIT') : null;
  } catch {
    return null;
  }
}

async function cacheMoodPageResponse(request: Request, response: Response): Promise<Response> {
  const edgeCache = getEdgeCache();
  if (!edgeCache || !isCacheableMoodPageRequest(request) || response.status !== 200) {
    return response;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('text/html')) {
    return response;
  }

  const outgoingHeaders = new Headers(response.headers);
  outgoingHeaders.set('Cache-Control', 'public, max-age=0, s-maxage=60, no-transform');
  outgoingHeaders.set(MOOD_PAGE_CACHE_HEADER, 'MISS');
  const outgoing = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: outgoingHeaders,
  });

  let body = '';
  try {
    body = await outgoing.clone().text();
  } catch {
    return outgoing;
  }

  if (!MOOD_PAGE_CACHE_READY_MARKERS.every((marker) => body.includes(marker))) {
    return withMoodPageCacheHeader(outgoing, 'BYPASS');
  }

  const cacheHeaders = new Headers(outgoingHeaders);
  cacheHeaders.set('Cache-Control', `public, max-age=${MOOD_PAGE_CACHE_TTL_SECONDS}, no-transform`);
  cacheHeaders.delete('Set-Cookie');

  try {
    await edgeCache.put(
      createMoodPageCacheRequest(request),
      new Response(body, {
        status: outgoing.status,
        statusText: outgoing.statusText,
        headers: cacheHeaders,
      }),
    );
  } catch {
    return outgoing;
  }

  return outgoing;
}

function accessRequired(): Response {
  return new Response(null, {
    status: 401,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

async function readAdminSession(context: {
  request: Request;
  locals: unknown;
  allowDevBypass?: boolean;
}): Promise<AdminSessionIdentity | null> {
  const url = new URL(context.request.url);
  const locals = context.locals as RuntimeEnvLocals | undefined;
  return (context.allowDevBypass ? readAdminDevBypassSession(locals, url.hostname) : null)
    ?? await readCloudflareAccessIdentity(context.request, locals);
}

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);
  const pathname = url.pathname;
  const legacyGhostRedirect = redirectLegacyGhostHost(url);
  if (legacyGhostRedirect) return legacyGhostRedirect;

  const cachedMoodPage = await readCachedMoodPage(context.request);
  if (cachedMoodPage) {
    return withHtmlSecurityHeaders(context.request, cachedMoodPage);
  }

  // Admin portal: served by this worker, gated by Cloudflare Access in production.
  if (isDevPortalPath(pathname)) {
    const session = await readAdminSession({ ...context, allowDevBypass: true });
    if (!session) {
      return accessRequired();
    }
    (context.locals as unknown as Record<string, unknown>).adminSession = session;
    return withHtmlSecurityHeaders(context.request, await next());
  }

  const docsVisibility = isDocsPath(pathname) ? await getDocsVisibilityFromContent(pathname) : 'missing';

  if (docsVisibility !== 'protected') {
    const response = withHtmlSecurityHeaders(context.request, await next());
    return cacheMoodPageResponse(context.request, response);
  }

  const session = await readAdminSession(context);
  if (session) {
    (context.locals as unknown as Record<string, unknown>).adminSession = session;
    return withHtmlSecurityHeaders(context.request, await next());
  }

  return accessRequired();
});
