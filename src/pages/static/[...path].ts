import type { APIRoute } from 'astro';
import { isE2ESiteFixtureEnabled } from '@/lib/e2e';
import { readEnv } from '@/lib/runtime/env';
import { checkRateLimit, createRateLimitHeaders } from '@/lib/security/rate-limit';
import {
  readStaticProxyKeyRing,
  verifyStaticProxyUrl,
} from '@/lib/security/static-proxy-signing';

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
  // YouTube posters enter only through the fixed `youtube/<id>/<quality>.jpg`
  // route below. Keeping the host here allows its validated redirects without
  // turning i.ytimg.com into an unsigned arbitrary-target proxy.
  'i.ytimg.com',
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
  'accept',
  'accept-language',
  'user-agent',
];

const redirectStatusCodes = new Set([301, 302, 303, 307, 308]);
const allowedContentTypePrefixes = ['image/', 'video/', 'audio/', 'font/'];
const confinedResponseHeaders = {
  'access-control-allow-origin': '*',
  'content-disposition': 'inline',
  'content-security-policy': "default-src 'none'; sandbox",
  'x-content-type-options': 'nosniff',
};
const MAX_REDIRECTS = 3;

type StaticProxyMode = 'observe' | 'accept-both' | 'enforce';

type ProxyTargetResolution =
  | { status: 'resolved'; targetUrl: string }
  | { status: 'invalid-target' }
  | { status: 'signature-rejected' };

const sanitizeContentType = (value: string | null): string | null => {
  const mediaType = value?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  return /^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/.test(mediaType)
    ? mediaType
    : null;
};

const isTelegramEmojiMetadataTarget = (targetUrl: string): boolean => {
  const url = new URL(targetUrl);
  return url.protocol === 'https:'
    && url.hostname === 't.me'
    && /^\/i\/emoji\/\d{1,32}\.json$/.test(url.pathname)
    && !url.search;
};

const isAllowedContentType = (contentType: string, targetUrl: string): boolean => {
  if (contentType === 'image/svg+xml') return false;
  if (contentType === 'application/json') return isTelegramEmojiMetadataTarget(targetUrl);
  if (contentType === 'application/octet-stream') return true;
  return allowedContentTypePrefixes.some((prefix) => contentType.startsWith(prefix));
};

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
      headers: {
        ...Object.fromEntries(extraHeaders),
        'cache-control': 'no-store',
      },
    });
  }

  const upstreamContentType = sanitizeContentType(upstream.headers.get('content-type'));
  if (!upstreamContentType || !isAllowedContentType(upstreamContentType, targetUrl)) {
    return new Response(null, {
      status: 415,
      headers: {
        ...Object.fromEntries(extraHeaders),
        'cache-control': 'no-store',
        ...confinedResponseHeaders,
      },
    });
  }

  const responseHeaders = new Headers(upstream.headers);
  hopByHopHeaders.forEach((name) => responseHeaders.delete(name));
  responseHeaders.delete('set-cookie');
  responseHeaders.delete('set-cookie2');
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('content-length');
  responseHeaders.set('content-type', upstreamContentType);
  Object.entries(confinedResponseHeaders).forEach(([name, value]) => {
    responseHeaders.set(name, value);
  });
  if (!upstream.ok) {
    responseHeaders.set('cache-control', 'no-store');
  } else if (!responseHeaders.has('cache-control')) {
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

  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return null;
  }
  if (!isAllowedTargetHost(url, allowedDomains)) return null;

  return url.toString();
};

const resolveExactTargetUrl = (
  targetUrl: string,
  allowedDomains: string[]
): string | null => {
  if (!/^https?:\/\//i.test(targetUrl)) return null;

  try {
    const target = new URL(targetUrl);
    return isAllowedTargetHost(target, allowedDomains) ? targetUrl : null;
  } catch {
    return null;
  }
};

const readStaticProxyMode = (locals: App.Locals): StaticProxyMode => {
  const value = readEnv(locals, 'STATIC_PROXY_MODE');
  return value === 'accept-both' || value === 'enforce' ? value : 'observe';
};

const isLegacyTargetPath = (rawPath: string): boolean => {
  return /^https?:\/\//i.test(normalizeTarget(decodeTarget(rawPath)));
};

const recordSignatureObservation = (
  mode: StaticProxyMode,
  status: 'unsigned' | 'invalid',
  targetUrl: string | null,
  reason?: string
): void => {
  let routeFamily = 'invalid-target';
  if (targetUrl) {
    try {
      routeFamily = new URL(targetUrl).hostname.toLowerCase() || routeFamily;
    } catch {
      // Keep the generic family when the target cannot be parsed.
    }
  }

  console.info('Static proxy signature observation', {
    mode,
    status,
    routeFamily,
    ...(reason ? { reason } : {}),
  });
};

const resolveProxyTarget = (
  request: Request,
  rawPath: string,
  locals: App.Locals,
  allowedDomains: string[]
): ProxyTargetResolution => {
  const mode = readStaticProxyMode(locals);
  const keyRing = readStaticProxyKeyRing(locals);
  const verification = isLegacyTargetPath(rawPath)
    ? { status: 'unsigned' as const, targetUrl: null }
    : verifyStaticProxyUrl(new URL(request.url), keyRing);

  if (verification.status === 'valid') {
    const targetUrl = resolveExactTargetUrl(verification.targetUrl, allowedDomains);
    return targetUrl ? { status: 'resolved', targetUrl } : { status: 'invalid-target' };
  }

  if (
    (verification.status === 'invalid' && mode !== 'observe')
    || (verification.status === 'unsigned' && mode === 'enforce')
  ) {
    const observationTarget = verification.status === 'invalid'
      ? verification.targetUrl
      : resolveTargetUrl(request, rawPath, allowedDomains);
    recordSignatureObservation(
      mode,
      verification.status,
      observationTarget,
      verification.status === 'invalid' ? verification.reason : undefined
    );
    return { status: 'signature-rejected' };
  }

  if (verification.status === 'invalid' && verification.targetUrl) {
    const targetUrl = resolveExactTargetUrl(verification.targetUrl, allowedDomains);
    recordSignatureObservation(mode, 'invalid', targetUrl, verification.reason);
    return targetUrl ? { status: 'resolved', targetUrl } : { status: 'invalid-target' };
  }

  const targetUrl = resolveTargetUrl(request, rawPath, allowedDomains);
  recordSignatureObservation(
    mode,
    verification.status,
    targetUrl,
    verification.status === 'invalid' ? verification.reason : undefined
  );
  return targetUrl ? { status: 'resolved', targetUrl } : { status: 'invalid-target' };
};

const resolveYouTubePosterTarget = (
  request: Request,
  rawPath: string,
): ProxyTargetResolution | null => {
  if (!rawPath.startsWith('youtube/')) return null;
  if (new URL(request.url).search) return { status: 'invalid-target' };

  const match = /^youtube\/([A-Za-z0-9_-]{11})\/(maxresdefault|hqdefault)\.jpg$/u.exec(rawPath);
  if (!match) return { status: 'invalid-target' };

  return {
    status: 'resolved',
    targetUrl: `https://i.ytimg.com/vi/${match[1]}/${match[2]}.jpg`,
  };
};

const createSignatureRejectedResponse = (headers: Headers, head = false): Response => {
  headers.set('cache-control', 'no-store');
  return new Response(head ? null : 'Invalid static proxy signature.', {
    status: 403,
    headers,
  });
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
  const targetResolution = resolveYouTubePosterTarget(request, rawPath)
    ?? resolveProxyTarget(request, rawPath, locals, allowedDomains);
  if (targetResolution.status === 'signature-rejected') {
    return createSignatureRejectedResponse(rateLimitHeaders);
  }
  if (targetResolution.status === 'invalid-target') {
    return new Response('Invalid target URL.', {
      status: 400,
      headers: rateLimitHeaders,
    });
  }
  const { targetUrl } = targetResolution;

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
  const targetResolution = resolveYouTubePosterTarget(request, rawPath)
    ?? resolveProxyTarget(request, rawPath, locals, allowedDomains);
  if (targetResolution.status === 'signature-rejected') {
    return createSignatureRejectedResponse(rateLimitHeaders, true);
  }
  if (targetResolution.status === 'invalid-target') {
    return new Response(null, {
      status: 400,
      headers: rateLimitHeaders,
    });
  }
  const { targetUrl } = targetResolution;

  return buildProxyResponse(request, targetUrl, rateLimitHeaders, allowedDomains);
};
