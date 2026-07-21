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
  const response = await fetch(createApiServiceRequest(request, origin));
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
