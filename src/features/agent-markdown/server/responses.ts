import { cacheEdgeResponse, readEdgeCache } from '@/lib/http/edge-cache';
import { estimateMarkdownTokens, prefersMarkdown } from './negotiation';
import {
  EDGE_CACHE_HEADER,
  MARKDOWN_CONTENT_TYPE,
  MARKDOWN_TOKEN_HEADER,
  type ContentRoutePolicy,
  getContentRoutePolicy,
  getMarkdownRenderer,
  hasMarkdownRenderer,
} from './registry';

const EDGE_CACHE_VERSION = '2';
const CLOUDFLARE_CDN_CACHE_CONTROL_HEADER = 'Cloudflare-CDN-Cache-Control';
const CONTENT_STALE_WHILE_REVALIDATE_SECONDS = 300;
const NO_STORE_CACHE_CONTROL = 'no-store, max-age=0';

export function appendHeaderToken(value: string | null, token: string): string {
  const current = value?.trim();
  if (!current) return token;
  const tokens = current.split(',').map((item) => item.trim().toLowerCase());
  if (tokens.includes(token.toLowerCase())) return current;
  return `${current}, ${token}`;
}

function appendCacheControlDirective(value: string | null, directive: string): string {
  const current = value?.trim();
  if (!current) return directive;
  if (new RegExp(`(?:^|,)\\s*${directive}\\b`, 'i').test(current)) return current;
  return `${current}, ${directive}`;
}

function hasFreshnessOrBypassDirective(value: string | null): boolean {
  return /\b(?:max-age|s-maxage|no-cache|no-store|private|must-revalidate|proxy-revalidate)\b/i.test(
    value ?? '',
  );
}

function hasExplicitBypassDirective(value: string | null): boolean {
  return /\b(?:no-cache|no-store|private)\b/i.test(value ?? '');
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

export function publicCacheControl(ttlSeconds: number, staleWhileRevalidateSeconds?: number): string {
  return [
    'public',
    'max-age=0',
    `s-maxage=${ttlSeconds}`,
    typeof staleWhileRevalidateSeconds === 'number'
      ? `stale-while-revalidate=${staleWhileRevalidateSeconds}`
      : '',
  ].filter(Boolean).join(', ');
}

export function cloudflareCdnCacheControl(
  ttlSeconds: number,
  staleWhileRevalidateSeconds = CONTENT_STALE_WHILE_REVALIDATE_SECONDS,
): string {
  return [
    'public',
    `max-age=${ttlSeconds}`,
    `stale-while-revalidate=${staleWhileRevalidateSeconds}`,
  ].join(', ');
}

function setContentCacheHeaders(
  headers: Headers,
  ttlSeconds: number,
  staleWhileRevalidateSeconds?: number,
): void {
  headers.set('Cache-Control', publicCacheControl(ttlSeconds, staleWhileRevalidateSeconds));
  headers.set(
    CLOUDFLARE_CDN_CACHE_CONTROL_HEADER,
    cloudflareCdnCacheControl(ttlSeconds, staleWhileRevalidateSeconds),
  );
}

function setNoStoreHeaders(headers: Headers): void {
  headers.set('Cache-Control', NO_STORE_CACHE_CONTROL);
  headers.delete(CLOUDFLARE_CDN_CACHE_CONTROL_HEADER);
}

function shouldApplyRouteCacheHeaders(url: URL, policy: ContentRoutePolicy): boolean {
  return policy.normalizeHtmlCacheSearch ? policy.normalizeHtmlCacheSearch(url) !== null : true;
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

  if (
    policy
    && response.status === 200
    && !hasExplicitBypassDirective(headers.get('Cache-Control'))
    && shouldApplyRouteCacheHeaders(url, policy)
  ) {
    setContentCacheHeaders(
      headers,
      policy.cacheTtlSeconds,
      policy.cacheStaleWhileRevalidateSeconds,
    );
  } else if (isHtml && !hasFreshnessOrBypassDirective(headers.get('Cache-Control'))) {
    headers.set(
      'Cache-Control',
      appendCacheControlDirective(headers.get('Cache-Control'), NO_STORE_CACHE_CONTROL),
    );
    headers.delete(CLOUDFLARE_CDN_CACHE_CONTROL_HEADER);
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
  if (status === 200) {
    setContentCacheHeaders(headers, ttlSeconds);
  } else {
    setNoStoreHeaders(headers);
  }
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
    cloudflareCacheControl: cloudflareCdnCacheControl(match.renderer.cacheTtlSeconds),
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
    cloudflareCacheControl: cloudflareCdnCacheControl(match.renderer.cacheTtlSeconds),
    isResponseCacheable: (candidate) =>
      (candidate.headers.get('content-type') ?? '').toLowerCase().includes('text/markdown'),
  });
}

function createHtmlCacheOptions(request: Request): Parameters<typeof readEdgeCache>[1] | null {
  const url = new URL(request.url);
  const policy = getContentRoutePolicy(url.pathname);
  if (!policy?.edgeCacheHtml) return null;

  const cacheSearch = policy.normalizeHtmlCacheSearch
    ? policy.normalizeHtmlCacheSearch(url)
    : url.search
      ? null
      : '';
  if (cacheSearch === null) return null;

  return {
    namespace: 'content',
    variant: 'html',
    version: EDGE_CACHE_VERSION,
    ttlSeconds: policy.cacheTtlSeconds,
    headerName: policy.cacheHeaderName,
    cacheControl: publicCacheControl(
      policy.cacheTtlSeconds,
      policy.cacheStaleWhileRevalidateSeconds,
    ),
    cloudflareCacheControl: policy.normalizeHtmlCacheSearch
      ? 'no-store'
      : cloudflareCdnCacheControl(
          policy.cacheTtlSeconds,
          policy.cacheStaleWhileRevalidateSeconds,
        ),
    cacheSearch,
    isResponseCacheable: (response) =>
      (response.headers.get('content-type') ?? '').toLowerCase().includes('text/html')
      && !hasExplicitBypassDirective(response.headers.get('Cache-Control')),
    isResponseReady: policy.isHtmlReady,
  };
}

export async function readCachedHtmlPage(request: Request): Promise<Response | null> {
  const options = createHtmlCacheOptions(request);
  if (!options) return null;

  return readEdgeCache(request, options);
}

export async function cacheHtmlPageResponse(request: Request, response: Response): Promise<Response> {
  const options = createHtmlCacheOptions(request);
  if (!options) return response;

  return cacheEdgeResponse(request, response, options);
}
