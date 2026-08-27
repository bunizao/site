import type { APIRoute } from 'astro';
import { jsonError } from '@/lib/http/json-response';
import { proxyApiRequest } from '@/lib/http/api-service-proxy';

export const prerender = false;

function normalizePortalApiPath(path: string | undefined): string | null {
  const cleanPath = (path ?? '').replace(/^\/+/, '');
  if (cleanPath !== 'admin' && !cleanPath.startsWith('admin/')) {
    return null;
  }
  // The prefix check above runs before `url.pathname` collapses dot segments,
  // so `admin/../../v2/...` would pass it and then resolve outside `/api/admin`.
  if (cleanPath.split('/').some((segment) => segment === '.' || segment === '..')) {
    return null;
  }
  return `/api/${cleanPath}`;
}

export const ALL: APIRoute = async ({ request, params, locals }) => {
  const targetPath = normalizePortalApiPath(params.path);
  if (!targetPath) {
    return jsonError(404, 'Not found', {
      'Cache-Control': 'no-store, max-age=0',
    });
  }

  const url = new URL(request.url);
  url.pathname = targetPath;

  const init: RequestInit & { duplex?: 'half' } = {
    headers: new Headers(request.headers),
    method: request.method,
    redirect: 'manual',
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
    init.duplex = 'half';
  }

  return proxyApiRequest(new Request(url, init), locals);
};
