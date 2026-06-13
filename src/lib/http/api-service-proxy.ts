import type { APIRoute } from 'astro';
import { jsonError } from '@/lib/http/json-response';
import { readRuntimeEnvSource, type EnvSource, type RuntimeEnvLocals } from '@/lib/runtime/env';

export interface ApiServiceBinding {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export const API_SERVICE_ORIGIN = 'https://api.buxx.me';

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
  const origin = new URL(API_SERVICE_ORIGIN);
  target.protocol = origin.protocol;
  target.hostname = origin.hostname;
  target.port = origin.port;
  return target;
}

export function createApiServiceRequest(request: Request): Request {
  const target = rewriteApiServiceUrl(request.url);
  const init: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers: new Headers(request.headers),
    redirect: 'manual',
  };

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

  const response = await api.fetch(createApiServiceRequest(request));

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });
}

export const proxyApiRoute: APIRoute = ({ request, locals }) => proxyApiRequest(request, locals);
