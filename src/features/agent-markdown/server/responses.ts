import { cacheEdgeResponse, readEdgeCache } from '@/lib/http/edge-cache';
import { estimateMarkdownTokens, prefersMarkdown } from './negotiation';
import {
  EDGE_CACHE_HEADER,
  MARKDOWN_CONTENT_TYPE,
  MARKDOWN_TOKEN_HEADER,
  getContentRoutePolicy,
  getMarkdownRenderer,
  hasMarkdownRenderer,
} from './registry';

const EDGE_CACHE_VERSION = '1';

export function appendHeaderToken(value: string | null, token: string): string {
  const current = value?.trim();
  if (!current) return token;
  const tokens = current.split(',').map((item) => item.trim().toLowerCase());
  if (tokens.includes(token.toLowerCase())) return current;
  return `${current}, ${token}`;
}

export function isNeverCachePath(pathname: string): boolean {
  return pathname === '/dev'
    || pathname.startsWith('/dev/')
    || pathname === '/oauth'
    || pathname.startsWith('/oauth/')
    || pathname === '/api'
    || pathname.startsWith('/api/')
    || pathname === '/v2'
    || pathname.startsWith('/v2/');
}

export function publicCacheControl(ttlSeconds: number, includeNoTransform = false): string {
  return [
    'public',
    'max-age=0',
    `s-maxage=${ttlSeconds}`,
    includeNoTransform ? 'no-transform' : '',
  ].filter(Boolean).join(', ');
}

export function withContentPolicy(request: Request, response: Response): Response {
  const contentType = response.headers.get('content-type') ?? '';
  const isHtml = contentType.toLowerCase().includes('text/html');

  const url = new URL(request.url);
  const policy = getContentRoutePolicy(url.pathname);
  if (!isHtml && !policy) return response;

  const headers = new Headers(response.headers);

  if (isHtml && hasMarkdownRenderer(url.pathname)) {
    headers.set('Vary', appendHeaderToken(headers.get('Vary'), 'Accept'));
  }

  if (policy && response.status === 200) {
    headers.set('Cache-Control', publicCacheControl(policy.cacheTtlSeconds, isHtml));
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function createMarkdownResponse(
  body: string,
  status: number,
  headersInit: HeadersInit | undefined,
  ttlSeconds: number,
): Response {
  const headers = new Headers(headersInit);
  headers.set('Content-Type', MARKDOWN_CONTENT_TYPE);
  headers.set('Cache-Control', publicCacheControl(ttlSeconds));
  headers.set('Vary', appendHeaderToken(headers.get('Vary'), 'Accept'));
  headers.set(MARKDOWN_TOKEN_HEADER, String(estimateMarkdownTokens(body)));

  return new Response(body, { status, headers });
}

function siteUrlForContext(context: { request: Request; site?: URL }): URL {
  return context.site ?? new URL(new URL(context.request.url).origin);
}

export async function renderMarkdownIfRequested(context: {
  request: Request;
  locals: unknown;
  site?: URL;
}): Promise<Response | null> {
  if (context.request.method !== 'GET') return null;
  if (!prefersMarkdown(context.request.headers.get('accept'))) return null;

  const url = new URL(context.request.url);
  if (isNeverCachePath(url.pathname)) return null;

  const match = getMarkdownRenderer(url.pathname);
  if (!match) return null;

  const cached = await readEdgeCache(context.request, {
    namespace: 'content',
    variant: 'markdown',
    version: EDGE_CACHE_VERSION,
    ttlSeconds: match.renderer.cacheTtlSeconds,
    headerName: EDGE_CACHE_HEADER,
    cacheControl: publicCacheControl(match.renderer.cacheTtlSeconds),
    isResponseCacheable: (response) =>
      (response.headers.get('content-type') ?? '').toLowerCase().includes('text/markdown'),
  });
  if (cached) return cached;

  const result = await match.renderer.render({
    request: context.request,
    locals: context.locals as App.Locals,
    url,
    site: siteUrlForContext(context),
    params: match.params,
  });
  const response = createMarkdownResponse(
    result.body,
    result.status ?? 200,
    result.headers,
    match.renderer.cacheTtlSeconds,
  );

  return cacheEdgeResponse(context.request, response, {
    namespace: 'content',
    variant: 'markdown',
    version: EDGE_CACHE_VERSION,
    ttlSeconds: match.renderer.cacheTtlSeconds,
    headerName: EDGE_CACHE_HEADER,
    cacheControl: publicCacheControl(match.renderer.cacheTtlSeconds),
    isResponseCacheable: (candidate) =>
      (candidate.headers.get('content-type') ?? '').toLowerCase().includes('text/markdown'),
  });
}

export async function readCachedHtmlPage(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const policy = getContentRoutePolicy(url.pathname);
  if (!policy?.edgeCacheHtml || url.search) return null;

  return readEdgeCache(request, {
    namespace: 'content',
    variant: 'html',
    version: EDGE_CACHE_VERSION,
    ttlSeconds: policy.cacheTtlSeconds,
    headerName: policy.cacheHeaderName,
    cacheControl: publicCacheControl(policy.cacheTtlSeconds, true),
    isResponseCacheable: (response) =>
      (response.headers.get('content-type') ?? '').toLowerCase().includes('text/html'),
  });
}

export async function cacheHtmlPageResponse(request: Request, response: Response): Promise<Response> {
  const url = new URL(request.url);
  const policy = getContentRoutePolicy(url.pathname);
  if (!policy?.edgeCacheHtml || url.search) return response;

  return cacheEdgeResponse(request, response, {
    namespace: 'content',
    variant: 'html',
    version: EDGE_CACHE_VERSION,
    ttlSeconds: policy.cacheTtlSeconds,
    headerName: policy.cacheHeaderName,
    cacheControl: publicCacheControl(policy.cacheTtlSeconds, true),
    isResponseCacheable: (candidate) =>
      (candidate.headers.get('content-type') ?? '').toLowerCase().includes('text/html'),
    isResponseReady: policy.isHtmlReady,
  });
}
