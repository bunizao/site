import {
  cacheEdgeResponse,
  readEdgeCache,
  type EdgeCacheHit,
  type EdgeCacheWaitContext,
} from '@/lib/http/edge-cache';
import { readRuntimeEnvSource, type RuntimeEnvLocals } from '@/lib/runtime/env';
import {
  isBlogPostPath,
  localeForTranslation,
  localeVersions,
  manifestEntryForPath,
  readI18nManifest,
} from '@/features/posts/server/i18n-manifest';
import { resolveRequestLocale } from '@/features/posts/i18n';
import { estimateMarkdownTokens, prefersMarkdown } from './negotiation';
import {
  EDGE_CACHE_HEADER,
  MARKDOWN_PATH_SUFFIX,
  MARKDOWN_CONTENT_TYPE,
  MARKDOWN_TOKEN_HEADER,
  type ContentRoutePolicy,
  explicitMarkdownSourcePath,
  getContentRoutePolicy,
  getMarkdownRenderer,
  hasMarkdownRenderer,
  markdownAlternatePath,
} from './registry';

const EDGE_CACHE_VERSION = '2';

export function contentEdgeCacheVersion(
  pathname: string,
  buildId = import.meta.env.PUBLIC_BUILD_ID,
): string {
  const normalizedPath = pathname === '/' ? pathname : pathname.replace(/\/+$/, '');
  const isBuildBackedContent = normalizedPath === '/'
    || normalizedPath === '/blog'
    || normalizedPath.startsWith('/blog/')
    || normalizedPath === '/docs'
    || normalizedPath.startsWith('/docs/');

  return isBuildBackedContent
    ? `${EDGE_CACHE_VERSION}:${buildId?.trim() || 'dev'}`
    : EDGE_CACHE_VERSION;
}
const CLOUDFLARE_CDN_CACHE_CONTROL_HEADER = 'Cloudflare-CDN-Cache-Control';
const CONTENT_STALE_WHILE_REVALIDATE_SECONDS = 300;
const NO_STORE_CACHE_CONTROL = 'no-store, max-age=0';

export interface BlogRequestResolution {
  grouped: boolean;
  locale: string | null;
  assetSlug: string;
  redirect?: Response;
}

function assetsFromLocals(locals: unknown): { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> } | null {
  const env = readRuntimeEnvSource(locals as RuntimeEnvLocals | undefined);
  const assets = env?.ASSETS;
  return assets && typeof assets === 'object' && typeof (assets as { fetch?: unknown }).fetch === 'function'
    ? assets as { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> }
    : null;
}

function cookieHeader(request: Request): string | null {
  return request.headers.get('cookie');
}

/** Resolve a blog URL to its canonical variant and, in production, its static asset slug. */
export async function resolveBlogRequest(request: Request, locals: unknown): Promise<BlogRequestResolution | null> {
  const url = new URL(request.url);
  if (!isBlogPostPath(url.pathname)) return null;
  const manifest = await readI18nManifest(locals, url.origin);
  if (!manifest) return null;
  const match = manifestEntryForPath(manifest, url.pathname);
  if (!match) return null;
  const { slug, entry } = match;
  const translationLocale = localeForTranslation(entry);
  if (entry.canonical && translationLocale) {
    const target = new URL(`/blog/${entry.canonical}`, url.origin);
    target.searchParams.set('lang', translationLocale);
    return {
      grouped: true,
      locale: translationLocale,
      assetSlug: entry.canonical,
      redirect: new Response(null, {
        status: 301,
        headers: {
          Location: `${target.pathname}${target.search}`,
          'Cache-Control': 'public, max-age=3600',
        },
      }),
    };
  }
  if (!entry.translations || Object.keys(entry.translations).length === 0) return null;
  const locale = resolveRequestLocale({
    query: url.searchParams.get('lang'),
    cookie: cookieHeader(request),
    acceptLanguage: request.headers.get('accept-language'),
    availableLocales: localeVersions(entry),
  });
  return {
    grouped: true,
    locale,
    assetSlug: entry.translations[locale] ?? slug,
  };
}

export function withBlogVariantHeaders(request: Request, response: Response, resolution: BlogRequestResolution): Response {
  if (!resolution.grouped || !resolution.locale) return response;
  const headers = new Headers(response.headers);
  headers.set('Vary', appendHeaderToken(headers.get('Vary'), 'Cookie'));
  headers.set('Vary', appendHeaderToken(headers.get('Vary'), 'Accept-Language'));
  headers.set('Content-Language', resolution.locale);
  if (new URL(request.url).searchParams.has('lang')) {
    headers.append('Set-Cookie', `blog_lang=${encodeURIComponent(resolution.locale)}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/** Fetch the negotiated static blog asset or return a translation-path redirect. */
export async function fetchBlogAsset(request: Request, locals: unknown): Promise<Response | null> {
  const resolution = await resolveBlogRequest(request, locals);
  if (!resolution) return null;
  if (resolution.redirect) return resolution.redirect;
  const assets = assetsFromLocals(locals);
  if (!assets) return null;
  const assetUrl = new URL(request.url);
  assetUrl.pathname = `/blog/${resolution.assetSlug}`;
  assetUrl.search = '';
  const response = await assets.fetch(new Request(assetUrl, {
    method: 'GET',
    headers: request.headers,
  }));
  if (response.status === 404) {
    return new Response('Blog translation asset is missing.\n', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': NO_STORE_CACHE_CONTROL },
    });
  }
  return withBlogVariantHeaders(request, response, resolution);
}

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

export function redirectCanonicalUrl(request: Request): Response | null {
  const url = new URL(request.url);
  let pathname = url.pathname;

  if (pathname !== '/') {
    pathname = pathname.replace(/\/+$/, '');
  }

  if (pathname.endsWith('.md') && !pathname.endsWith(MARKDOWN_PATH_SUFFIX)) {
    const sourcePath = pathname.slice(0, -'.md'.length) || '/';
    if (hasMarkdownRenderer(sourcePath)) {
      pathname = markdownAlternatePath(sourcePath);
    }
  }

  if (pathname === url.pathname) return null;

  url.pathname = pathname;
  return new Response(null, {
    status: 308,
    headers: {
      'Cache-Control': 'public, max-age=3600',
      Location: `${url.pathname}${url.search}`,
    },
  });
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

  const url = new URL(context.request.url);
  const explicitSourcePath = explicitMarkdownSourcePath(url.pathname);
  if (!explicitSourcePath && !prefersMarkdown(context.request.headers.get('accept'))) return null;
  if (isNeverCachePath(explicitSourcePath ?? url.pathname)) return null;

  const sourcePath = explicitSourcePath ?? url.pathname;
  const resolutionUrl = new URL(sourcePath, url.origin);
  resolutionUrl.search = url.search;
  const blogResolution = await resolveBlogRequest(
    new Request(resolutionUrl, context.request),
    context.locals,
  );
  if (blogResolution?.redirect) return blogResolution.redirect;
  const effectiveSourcePath = blogResolution?.grouped
    ? `/blog/${blogResolution.assetSlug}`
    : sourcePath;
  const match = getMarkdownRenderer(effectiveSourcePath);
  if (!match) return null;
  const cacheVersion = contentEdgeCacheVersion(effectiveSourcePath);

  const cached = await readEdgeCache(context.request, {
    namespace: 'content',
    variant: blogResolution?.grouped && blogResolution.locale
      ? `markdown:${blogResolution.locale}`
      : 'markdown',
    version: cacheVersion,
    ttlSeconds: match.renderer.cacheTtlSeconds,
    headerName: EDGE_CACHE_HEADER,
    cacheControl: publicCacheControl(match.renderer.cacheTtlSeconds),
    cloudflareCacheControl: blogResolution?.grouped
      ? 'no-store'
      : cloudflareCdnCacheControl(match.renderer.cacheTtlSeconds),
    isResponseCacheable: (response) =>
      (response.headers.get('content-type') ?? '').toLowerCase().includes('text/markdown'),
  });
  // Markdown passes no staleWhileRevalidateSeconds, so a hit is always fresh.
  if (cached) return cached.response;

  const result = await match.renderer.render({
    request: context.request,
    locals: context.locals as App.Locals,
    url: new URL(`${effectiveSourcePath}${url.search}`, url.origin),
    site: siteUrlForContext(context),
    params: match.params,
  });
  const response = withBlogVariantHeaders(context.request, createMarkdownResponse(
    result.body,
    result.status ?? 200,
    result.headers,
    match.renderer.cacheTtlSeconds,
  ), blogResolution ?? { grouped: false, locale: null, assetSlug: '' });

  return cacheEdgeResponse(context.request, response, {
    namespace: 'content',
    variant: blogResolution?.grouped && blogResolution.locale
      ? `markdown:${blogResolution.locale}`
      : 'markdown',
    version: cacheVersion,
    ttlSeconds: match.renderer.cacheTtlSeconds,
    headerName: EDGE_CACHE_HEADER,
    cacheControl: publicCacheControl(match.renderer.cacheTtlSeconds),
    cloudflareCacheControl: blogResolution?.grouped
      ? 'no-store'
      : cloudflareCdnCacheControl(match.renderer.cacheTtlSeconds),
    isResponseCacheable: (candidate) =>
      (candidate.headers.get('content-type') ?? '').toLowerCase().includes('text/markdown'),
  });
}

async function createHtmlCacheOptions(request: Request, locals?: unknown): Promise<Parameters<typeof readEdgeCache>[1] | null> {
  const url = new URL(request.url);
  const policy = getContentRoutePolicy(url.pathname);
  if (!policy?.edgeCacheHtml) return null;

  const blogResolution = locals ? await resolveBlogRequest(request, locals) : null;
  const grouped = Boolean(blogResolution?.grouped && blogResolution.locale);
  const cacheSearch = grouped
    ? ''
    : policy.normalizeHtmlCacheSearch
    ? policy.normalizeHtmlCacheSearch(url)
    : url.search
      ? null
      : '';
  if (cacheSearch === null) return null;

  return {
    namespace: 'content',
    variant: grouped ? `html:${blogResolution?.locale}` : 'html',
    version: contentEdgeCacheVersion(url.pathname),
    ttlSeconds: policy.cacheTtlSeconds,
    staleWhileRevalidateSeconds: policy.cacheStaleWhileRevalidateSeconds,
    headerName: policy.cacheHeaderName,
    cacheControl: publicCacheControl(
      policy.cacheTtlSeconds,
      policy.cacheStaleWhileRevalidateSeconds,
    ),
    cloudflareCacheControl: grouped || policy.normalizeHtmlCacheSearch
      ? 'no-store'
      : cloudflareCdnCacheControl(
          policy.cacheTtlSeconds,
          policy.cacheStaleWhileRevalidateSeconds,
        ),
    cacheSearch: grouped ? '' : cacheSearch,
    isResponseCacheable: (response) =>
      (response.headers.get('content-type') ?? '').toLowerCase().includes('text/html')
      && !hasExplicitBypassDirective(response.headers.get('Cache-Control')),
    isResponseReady: policy.isHtmlReady,
  };
}

export async function readCachedHtmlPage(request: Request, locals?: unknown): Promise<EdgeCacheHit | null> {
  const options = await createHtmlCacheOptions(request, locals);
  if (!options) return null;

  return readEdgeCache(request, options);
}

export async function cacheHtmlPageResponse(
  request: Request,
  response: Response,
  locals?: unknown,
  context?: EdgeCacheWaitContext,
): Promise<Response> {
  const options = await createHtmlCacheOptions(request, locals);
  if (!options) return response;

  return cacheEdgeResponse(request, response, options, context);
}
