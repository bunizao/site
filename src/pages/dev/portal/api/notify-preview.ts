import type { APIRoute } from 'astro';
import { jsonError } from '@/lib/http/json-response';
import { proxyApiRequest } from '@/lib/http/api-service-proxy';

export const prerender = false;

// site-api's /notify/preview has no auth of its own; the browser fetch this
// route replaces was rejected by edge config in front of buxx.me/api/*.
// Proxying through the portal keeps it behind the portal's own Access gate,
// same as every other dev/portal component.
const ALLOWED_PARAMS = ['mode', 'sample', 'timezone'];

export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const forwardedParams = new URLSearchParams();
  for (const key of ALLOWED_PARAMS) {
    const value = url.searchParams.get(key);
    if (value !== null) {
      forwardedParams.set(key, value);
    }
  }

  url.pathname = '/api/notify/preview';
  url.search = forwardedParams.toString();

  const init: RequestInit = {
    // Preserve incoming headers (e.g. cf-access-jwt-assertion) so this keeps
    // working if site-api ever adds its own auth upstream.
    headers: new Headers(request.headers),
    method: request.method,
    redirect: 'manual',
  };

  const response = await proxyApiRequest(new Request(url, init), locals);
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

export const ALL: APIRoute = () =>
  jsonError(405, 'Method not allowed', { 'Cache-Control': 'no-store' });
