export type EdgeCacheVariant = 'html' | 'markdown';
export type EdgeCacheStatus = 'HIT' | 'STALE' | 'MISS' | 'BYPASS';

interface EdgeCacheKeyOptions {
  namespace: string;
  variant: EdgeCacheVariant;
  version: string;
  cacheSearch?: string;
}

interface EdgeCacheOptions extends EdgeCacheKeyOptions {
  ttlSeconds: number;
  staleWhileRevalidateSeconds?: number;
  headerName: string;
  cacheControl: string;
  cloudflareCacheControl?: string;
  isRequestCacheable?: (request: Request) => boolean;
  isResponseCacheable?: (response: Response) => boolean;
  isResponseReady?: (body: string, response: Response) => boolean;
}

export interface EdgeCacheHit {
  response: Response;
  // True inside the stale-while-revalidate window: serve this response now and
  // re-render in the background via waitUntil.
  isStale: boolean;
}

export interface EdgeCacheWaitContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface MemoryCacheEntry {
  expiresAt: number;
  response: Response;
}

// Stamped on the stored copy so freshness is judged against write time rather
// than the storage layer's eviction, which runs at ttl + swr.
const CACHED_AT_HEADER = 'x-edge-cached-at';

const memoryCache = new Map<string, MemoryCacheEntry>();

function getNativeEdgeCache(): Cache | null {
  return (globalThis as { caches?: { default?: Cache } }).caches?.default ?? null;
}

function retentionSeconds(options: EdgeCacheOptions): number {
  return options.ttlSeconds + (options.staleWhileRevalidateSeconds ?? 0);
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
  headers.delete(CACHED_AT_HEADER);
  if (options.cloudflareCacheControl) {
    headers.set('Cloudflare-CDN-Cache-Control', options.cloudflareCacheControl);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function readEdgeCache(
  request: Request,
  options: EdgeCacheOptions,
): Promise<EdgeCacheHit | null> {
  if (request.method !== 'GET') return null;
  if (shouldBypassEdgeCache(request)) return null;
  if (options.isRequestCacheable && !options.isRequestCacheable(request)) return null;

  try {
    const cached = await readCache(buildVariantCacheKey(request, options));
    if (!cached) return null;

    // Entries without a stamp predate it; they were stored with max-age = ttl,
    // so the storage layer already evicts them on time — treat as fresh.
    const cachedAt = Number(cached.headers.get(CACHED_AT_HEADER));
    const ageSeconds = Number.isFinite(cachedAt) ? (Date.now() - cachedAt) / 1000 : 0;
    if (ageSeconds <= options.ttlSeconds) {
      return { response: withCacheHeader(cached, options, 'HIT'), isStale: false };
    }
    if (ageSeconds <= retentionSeconds(options)) {
      return { response: withCacheHeader(cached, options, 'STALE'), isStale: true };
    }
    return null;
  } catch {
    return null;
  }
}

export async function cacheEdgeResponse(
  request: Request,
  response: Response,
  options: EdgeCacheOptions,
  context?: EdgeCacheWaitContext,
): Promise<Response> {
  if (request.method !== 'GET') return response;
  if (shouldBypassEdgeCache(request)) return withCacheHeader(response, options, 'BYPASS');
  if (options.isRequestCacheable && !options.isRequestCacheable(request)) return response;
  if (response.status !== 200) return response;
  if (options.isResponseCacheable && !options.isResponseCacheable(response)) return response;

  const outgoing = withCacheHeader(response, options, 'MISS');
  const copy = outgoing.clone();

  const write = async (): Promise<void> => {
    const body = await copy.text();
    if (options.isResponseReady && !options.isResponseReady(body, copy)) return;

    const cacheHeaders = new Headers(copy.headers);
    cacheHeaders.set('Cache-Control', `public, max-age=${retentionSeconds(options)}`);
    cacheHeaders.set(CACHED_AT_HEADER, String(Date.now()));
    cacheHeaders.delete('Cloudflare-CDN-Cache-Control');
    cacheHeaders.delete('Set-Cookie');

    await writeCache(
      buildVariantCacheKey(request, options),
      new Response(body, {
        status: copy.status,
        statusText: copy.statusText,
        headers: cacheHeaders,
      }),
      retentionSeconds(options),
    );
  };

  // With a waitUntil the response streams to the client immediately and the
  // buffering + write happen after it; without one (dev, tests) the write is
  // awaited so a subsequent read observes it.
  if (context?.waitUntil) {
    context.waitUntil(write().catch(() => undefined));
    return outgoing;
  }

  try {
    await write();
  } catch {
    // Serving beats caching: a failed write must never fail the response.
  }
  return outgoing;
}
