import type { APIRoute } from 'astro';
import { jsonError } from '@/lib/http/json-response';
import { proxyApiRequest } from '@/lib/http/api-service-proxy';
import { isPortalDemo } from '@/features/portal/server/demo-mode';

export const prerender = false;

/* Analytics reads sit outside site-api's
   `/api/admin/*` but behind the same Access identity, and are read-only. */
const ANALYTICS_READS = /^(analytics\/(site|summary|events|article\/[^/]+|newsletter\/summary)|v2\/analytics\/listening)$/;

function normalizePortalApiPath(path: string | undefined, method: string): string | null {
  const cleanPath = (path ?? '').replace(/^\/+/, '');
  const admin = cleanPath === 'admin' || cleanPath.startsWith('admin/');
  const analytics = method === 'GET' && ANALYTICS_READS.test(cleanPath);
  if (!admin && !analytics) {
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
  const targetPath = normalizePortalApiPath(params.path, request.method);
  if (!targetPath) {
    return jsonError(404, 'Not found', {
      'Cache-Control': 'no-store, max-age=0',
    });
  }

  // The literal DEV check lets the build drop the demo module entirely.
  if (import.meta.env.DEV && await isPortalDemo(locals)) {
    const { handleDemoRequest } = await import('@/features/portal/server/demo-api');
    return handleDemoRequest(request, targetPath.slice('/api/'.length));
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
