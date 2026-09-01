import type { APIRoute } from 'astro';
import { jsonError } from '@/lib/http/json-response';
import {
  readOptionalEnv,
  readRuntimeEnvSource,
  type EnvSource,
  type RuntimeEnvLocals,
} from '@/lib/runtime/env';

export interface ApiServiceBinding {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export const API_SERVICE_BINDING_ORIGIN = 'https://site-api.internal';

function isApiServiceBinding(value: unknown): value is ApiServiceBinding {
  return typeof value === 'object'
    && value !== null
    && 'fetch' in value
    && typeof (value as { fetch?: unknown }).fetch === 'function';
}

type CloudflareEnvReader = () => Promise<EnvSource | undefined>;

async function readCloudflareWorkersEnv(): Promise<EnvSource | undefined> {
  try {
    const workers = await import('cloudflare:workers');
    return workers.env as EnvSource;
  } catch {
    return undefined;
  }
}

export async function getApiServiceBinding(
  locals: RuntimeEnvLocals | undefined,
  readCloudflareEnv: CloudflareEnvReader = readCloudflareWorkersEnv
): Promise<ApiServiceBinding | null> {
  const directBinding = locals?.env?.API;
  if (isApiServiceBinding(directBinding)) {
    return directBinding;
  }

  let binding: unknown;
  try {
    binding = locals?.runtime?.env?.API;
  } catch {
    binding = undefined;
  }

  if (!binding) {
    binding = readRuntimeEnvSource(locals)?.API;
  }

  if (isApiServiceBinding(binding)) {
    return binding;
  }

  const cloudflareBinding = (await readCloudflareEnv())?.API;
  return isApiServiceBinding(cloudflareBinding) ? cloudflareBinding : null;
}

export function rewriteApiServiceUrl(requestUrl: string, originUrl: string = API_SERVICE_BINDING_ORIGIN): URL {
  const target = new URL(requestUrl);
  const origin = new URL(originUrl);
  target.protocol = origin.protocol;
  target.hostname = origin.hostname;
  target.port = origin.port;
  target.pathname = rewriteApiServicePath(target.pathname);
  return target;
}

function rewriteApiServicePath(pathname: string): string {
  if (
    pathname === '/oauth'
    || pathname.startsWith('/oauth/')
  ) {
    return pathname;
  }

  if (pathname === '/api' || pathname.startsWith('/api/')) {
    return pathname;
  }

  return pathname.startsWith('/v1') || pathname.startsWith('/v2') ? pathname : `/v2${pathname}`;
}

export function createApiServiceRequest(request: Request, originUrl: string = API_SERVICE_BINDING_ORIGIN): Request {
  const target = rewriteApiServiceUrl(request.url, originUrl);
  const source = new URL(request.url);
  const headers = new Headers(request.headers);
  const init: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers,
    redirect: 'manual',
  };
  headers.set('X-Forwarded-Host', source.host);
  headers.set('X-Forwarded-Proto', source.protocol.replace(':', ''));
  headers.set('X-Forwarded-Origin', source.origin);
  headers.set('X-Buxx-Forwarded-Url', source.toString());

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
    init.duplex = 'half';
  }

  return new Request(target, init);
}

// Default origin for the dev HTTP fallback. buxx.me/* already routes /api,
// /v2 and /oauth straight to the deployed site-api worker, so frontend-only
// dev works with no extra setup. Override API_DEV_ORIGIN in .env.local to a
// local `wrangler dev` site-api (e.g. http://localhost:8787) or a preview URL
// when you are debugging the API itself.
const DEFAULT_DEV_API_ORIGIN = 'https://buxx.me';
const DEV_MOOD_CACHE_TTL_MS = 30_000;
const DEV_MOOD_CACHE_STALE_MS = 24 * 60 * 60 * 1000;

interface DevMoodCacheEntry {
  response: Response;
  freshUntil: number;
  staleUntil: number;
}

const devMoodResponseCache = new Map<string, DevMoodCacheEntry>();
const devMoodRequests = new Map<string, Promise<Response>>();

export function resolveDevApiOrigin(locals: RuntimeEnvLocals | undefined): string | null {
  // Only ever fall back to plain HTTP under `astro dev`. In production the
  // service binding is always present, so this branch is never reached there.
  if (!import.meta.env.DEV) {
    return null;
  }

  return readOptionalEnv(locals, 'API_DEV_ORIGIN') ?? DEFAULT_DEV_API_ORIGIN;
}

export async function proxyApiRequest(request: Request, locals: RuntimeEnvLocals | undefined): Promise<Response> {
  const api = await getApiServiceBinding(locals);
  if (api) {
    return proxyApiBindingRequest(request, api);
  }

  const devOrigin = resolveDevApiOrigin(locals);
  if (devOrigin) {
    return proxyApiHttpRequest(request, devOrigin);
  }

  return jsonError(503, 'API service binding unavailable', {
    'Cache-Control': 'no-store, max-age=0',
  });
}

async function proxyApiHttpRequest(request: Request, origin: string): Promise<Response> {
  const upstreamRequest = createApiServiceRequest(request, origin);
  // The dev fallback is a real HTTP hop, so its Origin must match the
  // upstream URL. Service bindings keep the public Origin and the explicit
  // X-Forwarded-Origin pair expected by site-api's internal-host middleware.
  upstreamRequest.headers.set('origin', new URL(origin).origin);
  // Let fetch negotiate encodings it can decompress. Forwarding a browser's
  // zstd preference can leave Node streaming compressed bytes to the client.
  upstreamRequest.headers.delete('accept-encoding');

  if (isDevMoodRequest(upstreamRequest)) {
    return proxyCachedDevMoodRequest(upstreamRequest);
  }

  return fetchApiHttpRequest(upstreamRequest);
}

function isDevMoodRequest(request: Request): boolean {
  if (request.method !== 'GET') return false;
  const pathname = new URL(request.url).pathname;
  return pathname === '/api/v2/mood' || pathname.startsWith('/api/v2/mood/');
}

function hasCacheBypass(request: Request): boolean {
  const cacheControl = request.headers.get('cache-control') ?? '';
  const pragma = request.headers.get('pragma') ?? '';
  return /\bno-cache\b|\bno-store\b/i.test(cacheControl) || /\bno-cache\b/i.test(pragma);
}

function withDevMoodCacheStatus(response: Response, status: 'HIT' | 'MISS' | 'STALE'): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Buxx-Dev-Mood-Cache', status);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function proxyCachedDevMoodRequest(request: Request): Promise<Response> {
  const key = request.url;
  const now = Date.now();
  const cached = devMoodResponseCache.get(key);
  if (cached && cached.staleUntil <= now) {
    devMoodResponseCache.delete(key);
  } else if (cached && cached.freshUntil > now && !hasCacheBypass(request)) {
    return withDevMoodCacheStatus(cached.response.clone(), 'HIT');
  }

  const existingRequest = devMoodRequests.get(key);
  if (existingRequest) return (await existingRequest).clone();

  const pendingRequest = fetchDevMoodRequest(request, cached);
  devMoodRequests.set(key, pendingRequest);
  try {
    return (await pendingRequest).clone();
  } finally {
    devMoodRequests.delete(key);
  }
}

async function fetchDevMoodRequest(
  request: Request,
  stale: DevMoodCacheEntry | undefined,
): Promise<Response> {
  try {
    let response: Response;
    try {
      response = await fetchApiHttpRequest(request.clone());
    } catch {
      response = await fetchApiHttpRequest(request.clone());
    }

    if (response.ok) {
      const now = Date.now();
      devMoodResponseCache.set(request.url, {
        response: response.clone(),
        freshUntil: now + DEV_MOOD_CACHE_TTL_MS,
        staleUntil: now + DEV_MOOD_CACHE_STALE_MS,
      });
    } else if (response.status >= 500 && stale && stale.staleUntil > Date.now()) {
      console.warn(`Dev mood API returned ${response.status}; serving stale response.`);
      return withDevMoodCacheStatus(stale.response.clone(), 'STALE');
    }
    return withDevMoodCacheStatus(response, 'MISS');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (stale && stale.staleUntil > Date.now()) {
      console.warn(`Dev mood API fetch failed; serving stale response: ${message}`);
      return withDevMoodCacheStatus(stale.response.clone(), 'STALE');
    }

    console.warn(`Dev mood API fetch failed: ${message}`);
    return jsonError(502, 'Mood API temporarily unavailable', {
      'Cache-Control': 'no-store, max-age=0',
      'X-Buxx-Dev-Mood-Cache': 'MISS',
    });
  }
}

async function fetchApiHttpRequest(request: Request): Promise<Response> {
  const response = await fetch(request);
  const headers = new Headers(response.headers);
  headers.delete('content-encoding');
  headers.delete('content-length');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function proxyApiBindingRequest(request: Request, api: ApiServiceBinding): Promise<Response> {
  const response = await api.fetch(createApiServiceRequest(request));

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });
}

export const proxyApiRoute: APIRoute = ({ request, locals }) => proxyApiRequest(request, locals);
