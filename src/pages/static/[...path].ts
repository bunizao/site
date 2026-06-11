import type { APIRoute } from 'astro';
import { isE2ESiteFixtureEnabled } from '@/lib/e2e';
import { readEnv } from '@/lib/runtime/env';
import { checkRateLimit, createRateLimitHeaders } from '@/lib/security/rate-limit';

export const prerender = false;

// Whitelist of allowed Telegram-related domains.
const TELEGRAM_ALLOWED_DOMAINS = [
  't.me',
  'telegram.org',
  'telegram.me',
  'telegram.dog',
  'cdn-telegram.org',
  'cdn1.telegram-cdn.org',
  'cdn2.telegram-cdn.org',
  'cdn3.telegram-cdn.org',
  'cdn4.telegram-cdn.org',
  'cdn5.telegram-cdn.org',
  'telesco.pe',
];

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
  'accept-language',
  'user-agent',
];

const redirectStatusCodes = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 3;

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

function getAllowedDomains(locals: any): string[] {
  const domains = new Set(TELEGRAM_ALLOWED_DOMAINS);
  const hdImageUrl = readEnv(locals, 'PUBLIC_HD_IMAGE_URL');

  if (hdImageUrl) {
    try {
      const parsed = new URL(hdImageUrl);
      if (parsed.hostname) {
        domains.add(parsed.hostname.toLowerCase());
      }
    } catch {
      // Ignore invalid PUBLIC_HD_IMAGE_URL values.
    }
  }

  return Array.from(domains);
}

const isAllowedTargetHost = (url: URL, allowedDomains: string[]): boolean => {
  if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    return false;
  }

  return allowedDomains.some(
    (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`)
  );
};

const fetchWithValidatedRedirects = async (
  request: Request,
  targetUrl: string,
  headers: Headers,
  allowedDomains: string[]
): Promise<Response> => {
  let currentUrl = targetUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const upstream = await fetch(currentUrl, {
      method: request.method,
      headers,
      redirect: 'manual',
    });

    if (!redirectStatusCodes.has(upstream.status)) {
      return upstream;
    }

    if (redirectCount === MAX_REDIRECTS) {
      throw new Error('Too many upstream redirects');
    }

    const location = upstream.headers.get('location');
    if (!location) {
      throw new Error('Upstream redirect missing location header');
    }

    let nextUrl: URL;
    try {
      nextUrl = new URL(location, currentUrl);
    } catch {
      throw new Error('Invalid upstream redirect URL');
    }

    if (!/^https?:$/i.test(nextUrl.protocol) || !isAllowedTargetHost(nextUrl, allowedDomains)) {
      throw new Error('Upstream redirect target is not allowed');
    }

    currentUrl = nextUrl.toString();
  }

  throw new Error('Redirect handling failed');
};

const buildProxyResponse = async (
  request: Request,
  targetUrl: string,
  extraHeaders: Headers,
  allowedDomains: string[]
): Promise<Response> => {
  const headers = new Headers();
  forwardHeadersAllowList.forEach((name) => {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  });

  let upstream: Response;
  try {
    upstream = await fetchWithValidatedRedirects(request, targetUrl, headers, allowedDomains);
  } catch (error) {
    console.error('Upstream fetch failed:', { targetUrl, error });
    return new Response('Upstream fetch failed.', {
      status: 502,
      headers: extraHeaders,
    });
  }

  const responseHeaders = new Headers(upstream.headers);
  hopByHopHeaders.forEach((name) => responseHeaders.delete(name));
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('content-length');
  responseHeaders.set('access-control-allow-origin', '*');
  if (!responseHeaders.has('cache-control')) {
    responseHeaders.set('cache-control', 'public, max-age=86400, s-maxage=86400');
  }
  extraHeaders.forEach((value, key) => {
    responseHeaders.set(key, value);
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
};

const resolveTargetUrl = (
  request: Request,
  rawPath: string,
  allowedDomains: string[]
): string | null => {
  let target = normalizeTarget(decodeTarget(rawPath));
  if (!target) return null;

  const search = new URL(request.url).search;
  if (search) {
    target += target.includes('?') ? `&${search.slice(1)}` : search;
  }

  if (!/^https?:\/\//i.test(target)) return null;

  const url = new URL(target);
  if (!isAllowedTargetHost(url, allowedDomains)) return null;

  return url.toString();
};

const createRateLimitedResponse = (headers: Headers): Response => {
  return new Response('Too Many Requests.', {
    status: 429,
    headers,
  });
};

export const GET: APIRoute = async ({ request, params, locals }) => {
  const rateLimit = checkRateLimit(
    request,
    { windowMs: 60_000, max: 240, prefix: 'api:static-proxy' },
    locals
  );
  const rateLimitHeaders = createRateLimitHeaders(rateLimit);
  if (!rateLimit.allowed) {
    return createRateLimitedResponse(rateLimitHeaders);
  }

  const rawPath = params.path ?? '';
  const allowedDomains = getAllowedDomains(locals);
  const targetUrl = resolveTargetUrl(request, rawPath, allowedDomains);
  if (!targetUrl) {
    return new Response('Invalid target URL.', {
      status: 400,
      headers: rateLimitHeaders,
    });
  }

  if (isE2ESiteFixtureEnabled(locals) && targetUrl === 'https://cdn4.telegram-cdn.org/e2e-image.png') {
    return new Response('e2e-image', {
      status: 200,
      headers: {
        'content-type': 'image/png',
        'cache-control': 'public, max-age=86400, s-maxage=86400',
        'access-control-allow-origin': '*',
        ...Object.fromEntries(rateLimitHeaders),
      },
    });
  }

  return buildProxyResponse(request, targetUrl, rateLimitHeaders, allowedDomains);
};

export const HEAD: APIRoute = async ({ request, params, locals }) => {
  const rateLimit = checkRateLimit(
    request,
    { windowMs: 60_000, max: 240, prefix: 'api:static-proxy' },
    locals
  );
  const rateLimitHeaders = createRateLimitHeaders(rateLimit);
  if (!rateLimit.allowed) {
    return createRateLimitedResponse(rateLimitHeaders);
  }

  const rawPath = params.path ?? '';
  const allowedDomains = getAllowedDomains(locals);
  const targetUrl = resolveTargetUrl(request, rawPath, allowedDomains);
  if (!targetUrl) {
    return new Response(null, {
      status: 400,
      headers: rateLimitHeaders,
    });
  }

  return buildProxyResponse(request, targetUrl, rateLimitHeaders, allowedDomains);
};
