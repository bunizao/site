import type { APIRoute } from 'astro';

export const prerender = false;

const hopByHopHeaders = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
]);

const forwardHeadersAllowList = [
  'range',
  'if-range',
  'if-modified-since',
  'if-none-match',
  'accept',
  'user-agent',
];

const decodeTarget = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const normalizeTarget = (value: string): string => {
  if (value.startsWith('https:/') && !value.startsWith('https://')) {
    return value.replace('https:/', 'https://');
  }
  if (value.startsWith('http:/') && !value.startsWith('http://')) {
    return value.replace('http:/', 'http://');
  }
  return value;
};

const buildProxyResponse = async (request: Request, targetUrl: string): Promise<Response> => {
  const headers = new Headers();
  forwardHeadersAllowList.forEach((name) => {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  });

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, {
      method: request.method,
      headers,
      redirect: 'follow',
    });
  } catch (error) {
    console.error('Upstream fetch failed:', { targetUrl, error });
    return new Response('Upstream fetch failed.', { status: 502 });
  }

  const responseHeaders = new Headers(upstream.headers);
  hopByHopHeaders.forEach((name) => responseHeaders.delete(name));
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('content-length');
  responseHeaders.set('access-control-allow-origin', '*');

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
};

const resolveTargetUrl = (request: Request, rawPath: string): string | null => {
  let target = normalizeTarget(decodeTarget(rawPath));
  if (!target) return null;

  const search = new URL(request.url).search;
  if (search) {
    target += target.includes('?') ? `&${search.slice(1)}` : search;
  }

  if (!/^https?:\/\//i.test(target)) return null;

  const url = new URL(target);
  if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    return null;
  }

  return url.toString();
};

export const GET: APIRoute = async ({ request, params }) => {
  const rawPath = params.path ?? '';
  const targetUrl = resolveTargetUrl(request, rawPath);
  if (!targetUrl) {
    return new Response('Invalid target URL.', { status: 400 });
  }

  return buildProxyResponse(request, targetUrl);
};

export const HEAD: APIRoute = async ({ request, params }) => {
  const rawPath = params.path ?? '';
  const targetUrl = resolveTargetUrl(request, rawPath);
  if (!targetUrl) {
    return new Response(null, { status: 400 });
  }

  return buildProxyResponse(request, targetUrl);
};
