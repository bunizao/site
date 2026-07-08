export type EdgeCacheVariant = 'html' | 'markdown';
export type EdgeCacheStatus = 'HIT' | 'MISS' | 'BYPASS';

interface EdgeCacheKeyOptions {
  namespace: string;
  variant: EdgeCacheVariant;
  version: string;
  cacheSearch?: string;
}

interface EdgeCacheOptions extends EdgeCacheKeyOptions {
  ttlSeconds: number;
  headerName: string;
  cacheControl: string;
  cloudflareCacheControl?: string;
  isRequestCacheable?: (request: Request) => boolean;
  isResponseCacheable?: (response: Response) => boolean;
  isResponseReady?: (body: string, response: Response) => boolean;
}

interface MemoryCacheEntry {
  expiresAt: number;
  response: Response;
}

const memoryCache = new Map<string, MemoryCacheEntry>();

function getNativeEdgeCache(): Cache | null {
  return (globalThis as { caches?: { default?: Cache } }).caches?.default ?? null;
}

async function readCache(key: Request): Promise<Response | null> {
  const nativeCache = getNativeEdgeCache();
  if (nativeCache) {
    return (await nativeCache.match(key)) ?? null;
  }

  const entry = memoryCache.get(key.url);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memoryCache.delete(key.url);
    return null;
  }

  return entry.response.clone();
}

async function writeCache(key: Request, response: Response, ttlSeconds: number): Promise<void> {
  const nativeCache = getNativeEdgeCache();
  if (nativeCache) {
    await nativeCache.put(key, response);
    return;
  }

  memoryCache.set(key.url, {
    expiresAt: Date.now() + ttlSeconds * 1000,
    response: response.clone(),
  });
}

export function shouldBypassEdgeCache(request: Request): boolean {
  const cacheControl = request.headers.get('cache-control') ?? '';
  if (/\bno-cache\b|\bno-store\b/i.test(cacheControl)) return true;

  const pragma = request.headers.get('pragma') ?? '';
  return /\bno-cache\b/i.test(pragma);
}

export function buildVariantCacheKey(request: Request, options: EdgeCacheKeyOptions): Request {
  const url = new URL(request.url);
  const key = new URL(`https://edge-cache.internal/${options.namespace}`);
  key.searchParams.set('origin', url.origin);
  key.searchParams.set('path', url.pathname);
  key.searchParams.set('search', options.cacheSearch ?? url.search);
  key.searchParams.set('variant', options.variant);
  key.searchParams.set('v', options.version);
  return new Request(key);
}

function withCacheHeader(response: Response, options: EdgeCacheOptions, status: EdgeCacheStatus): Response {
  const headers = new Headers(response.headers);
  headers.set(options.headerName, status);
  headers.set('Cache-Control', options.cacheControl);
  if (options.cloudflareCacheControl) {
    headers.set('Cloudflare-CDN-Cache-Control', options.cloudflareCacheControl);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function readEdgeCache(request: Request, options: EdgeCacheOptions): Promise<Response | null> {
  if (request.method !== 'GET') return null;
  if (shouldBypassEdgeCache(request)) return null;
  if (options.isRequestCacheable && !options.isRequestCacheable(request)) return null;

  try {
    const cached = await readCache(buildVariantCacheKey(request, options));
    return cached ? withCacheHeader(cached, options, 'HIT') : null;
  } catch {
    return null;
  }
}

export async function cacheEdgeResponse(
  request: Request,
  response: Response,
  options: EdgeCacheOptions,
): Promise<Response> {
  if (request.method !== 'GET') return response;
  if (shouldBypassEdgeCache(request)) return withCacheHeader(response, options, 'BYPASS');
  if (options.isRequestCacheable && !options.isRequestCacheable(request)) return response;
  if (response.status !== 200) return response;
  if (options.isResponseCacheable && !options.isResponseCacheable(response)) return response;

  const outgoing = withCacheHeader(response, options, 'MISS');
  let body = '';

  try {
    body = await outgoing.clone().text();
  } catch {
    return outgoing;
  }

  if (options.isResponseReady && !options.isResponseReady(body, outgoing)) {
    return withCacheHeader(outgoing, options, 'BYPASS');
  }

  const cacheHeaders = new Headers(outgoing.headers);
  cacheHeaders.set('Cache-Control', `public, max-age=${options.ttlSeconds}`);
  cacheHeaders.delete('Cloudflare-CDN-Cache-Control');
  cacheHeaders.delete('Set-Cookie');

  try {
    await writeCache(
      buildVariantCacheKey(request, options),
      new Response(body, {
        status: outgoing.status,
        statusText: outgoing.statusText,
        headers: cacheHeaders,
      }),
      options.ttlSeconds,
    );
  } catch {
    return outgoing;
  }

  return outgoing;
}
