import type { APIRoute } from 'astro';
import { jsonError } from '@/lib/http/json-response';
import { readRuntimeEnvSource, type EnvSource, type RuntimeEnvLocals } from '@/lib/runtime/env';

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

export function rewriteApiServiceUrl(requestUrl: string): URL {
  const target = new URL(requestUrl);
  const origin = new URL(API_SERVICE_BINDING_ORIGIN);
  target.protocol = origin.protocol;
  target.hostname = origin.hostname;
  target.port = origin.port;
  target.pathname = rewriteApiServicePath(target.pathname);
  return target;
}

function rewriteApiServicePath(pathname: string): string {
  if (
    pathname === '/dev'
    || pathname.startsWith('/dev/')
    || pathname === '/oauth'
    || pathname.startsWith('/oauth/')
  ) {
    return pathname;
  }

  if (pathname === '/api') {
    return '/v2';
  }

  if (pathname.startsWith('/api/')) {
    return `/v2${pathname.slice('/api'.length)}`;
  }

  return pathname.startsWith('/v1') || pathname.startsWith('/v2') ? pathname : `/v2${pathname}`;
}

export function createApiServiceRequest(request: Request): Request {
  const target = rewriteApiServiceUrl(request.url);
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

export async function proxyApiRequest(request: Request, locals: RuntimeEnvLocals | undefined): Promise<Response> {
  const api = await getApiServiceBinding(locals);
  if (!api) {
    return jsonError(503, 'API service binding unavailable', {
      'Cache-Control': 'no-store, max-age=0',
    });
  }

  return proxyApiBindingRequest(request, api);
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
