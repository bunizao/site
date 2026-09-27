import type { APIRoute } from 'astro';
import { isE2ESiteFixtureEnabled } from '@/lib/e2e';
import { readEnv } from '@/lib/runtime/env';
import { checkRateLimit, createRateLimitHeaders } from '@/lib/security/rate-limit';
import {
  resolveYouTubeChannelAvatarUrl,
  resolveYouTubeMetadata,
} from '@/features/posts/server/youtube';

export const prerender = false;

const YOUTUBE_POSTER_HOST = 'i.ytimg.com';
const YOUTUBE_AVATAR_HOSTS = ['yt3.googleusercontent.com', 'yt3.ggpht.com'];

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

type ProxyTargetResolution =
  | { status: 'resolved'; targetUrl: string }
  | { status: 'invalid-target' }
  | { status: 'upstream-unavailable' };

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

// The retired HD image host. Old mood content still names it, and site-api's
// email renderer routes such image URLs through this proxy.
const LEGACY_HD_IMAGE_HOST = 'image.buxx.me';

function getAllowedDomains(locals: any): string[] {
  const domains = new Set([...TELEGRAM_ALLOWED_DOMAINS, LEGACY_HD_IMAGE_HOST]);
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
  if (['localhost', '127.0.0.1'].includes(url.hostname)) {
    return false;
  }
  if (allowedDomains.includes(url.hostname)) return true;

  // Only Telegram serves media from subdomains; every other host must match
  // exactly, so the HD image host never admits its siblings (admin., api.).
  return TELEGRAM_ALLOWED_DOMAINS.some((domain) => url.hostname.endsWith(`.${domain}`));
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

const resolveProxyTarget = (
  request: Request,
  rawPath: string,
  allowedDomains: string[]
): ProxyTargetResolution => {
  const targetUrl = resolveTargetUrl(request, rawPath, allowedDomains);
  return targetUrl ? { status: 'resolved', targetUrl } : { status: 'invalid-target' };
};

const resolveYouTubeAssetTarget = async (
  request: Request,
  rawPath: string,
): Promise<ProxyTargetResolution | null> => {
  if (!rawPath.startsWith('youtube/')) return null;
  if (new URL(request.url).search) return { status: 'invalid-target' };

  const posterMatch = /^youtube\/([A-Za-z0-9_-]{11})\/(maxresdefault|hqdefault)\.jpg$/u.exec(rawPath);
  if (posterMatch) {
    return {
      status: 'resolved',
      targetUrl: `https://${YOUTUBE_POSTER_HOST}/vi/${posterMatch[1]}/${posterMatch[2]}.jpg`,
    };
  }

  const avatarMatch = /^youtube\/([A-Za-z0-9_-]{11})\/avatar\.jpg$/u.exec(rawPath);
  if (!avatarMatch) return { status: 'invalid-target' };

  const targetUrl = await resolveYouTubeChannelAvatarUrl(avatarMatch[1]);
  return targetUrl ? { status: 'resolved', targetUrl } : { status: 'upstream-unavailable' };
};

const resolveRequestTarget = async (
  request: Request,
  rawPath: string,
  locals: App.Locals,
): Promise<{ allowedDomains: string[]; targetResolution: ProxyTargetResolution }> => {
  const youtubeAssetTarget = await resolveYouTubeAssetTarget(request, rawPath);
  const allowedDomains = getAllowedDomains(locals);
  if (youtubeAssetTarget?.status === 'resolved') {
    const hostname = new URL(youtubeAssetTarget.targetUrl).hostname.toLowerCase();
    if (hostname === YOUTUBE_POSTER_HOST) {
      allowedDomains.push(YOUTUBE_POSTER_HOST);
    } else if (YOUTUBE_AVATAR_HOSTS.includes(hostname)) {
      allowedDomains.push(...YOUTUBE_AVATAR_HOSTS);
    }
  }

  return {
    allowedDomains,
    targetResolution: youtubeAssetTarget
      ?? resolveProxyTarget(request, rawPath, allowedDomains),
  };
};

const createRateLimitedResponse = (headers: Headers): Response => {
  return new Response('Too Many Requests.', {
    status: 429,
    headers,
  });
};

const createUpstreamUnavailableResponse = (headers: Headers, head = false): Response => {
  headers.set('cache-control', 'no-store');
  return new Response(head ? null : 'YouTube channel avatar unavailable.', {
    status: 502,
    headers,
  });
};

const readYouTubeMetadataId = (request: Request, rawPath: string): string | null => {
  if (new URL(request.url).search) return null;
  return /^youtube\/([A-Za-z0-9_-]{11})\/metadata\.json$/u.exec(rawPath)?.[1] ?? null;
};

const createYouTubeMetadataResponse = async (
  id: string,
  headers: Headers,
  head = false,
): Promise<Response> => {
  const metadata = await resolveYouTubeMetadata(id);
  if (!metadata) return createUpstreamUnavailableResponse(headers, head);

  headers.set('access-control-allow-origin', '*');
  headers.set('cache-control', 'public, max-age=86400, s-maxage=86400');
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(head ? null : JSON.stringify({
    channelName: metadata.channelName,
    channelUrl: metadata.channelUrl ?? null,
  }), { status: 200, headers });
};

export const GET: APIRoute = async ({ request, params, locals }) => {
  const rateLimit = checkRateLimit(
    request,
    { windowMs: 60_000, max: 240, prefix: 'api:static-proxy' },
  );
  const rateLimitHeaders = createRateLimitHeaders(rateLimit);
  if (!rateLimit.allowed) {
    return createRateLimitedResponse(rateLimitHeaders);
  }

  const rawPath = params.path ?? '';
  const metadataId = readYouTubeMetadataId(request, rawPath);
  if (metadataId) {
    return createYouTubeMetadataResponse(metadataId, rateLimitHeaders);
  }
  const { allowedDomains, targetResolution } = await resolveRequestTarget(request, rawPath, locals);
  if (targetResolution.status === 'invalid-target') {
    return new Response('Invalid target URL.', {
      status: 400,
      headers: rateLimitHeaders,
    });
  }
  if (targetResolution.status === 'upstream-unavailable') {
    return createUpstreamUnavailableResponse(rateLimitHeaders);
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

  if (
    isE2ESiteFixtureEnabled(locals)
    && targetUrl === 'https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg'
  ) {
    return new Response('e2e-youtube-poster', {
      status: 200,
      headers: {
        'content-type': 'image/jpeg',
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
  );
  const rateLimitHeaders = createRateLimitHeaders(rateLimit);
  if (!rateLimit.allowed) {
    return createRateLimitedResponse(rateLimitHeaders);
  }

  const rawPath = params.path ?? '';
  const metadataId = readYouTubeMetadataId(request, rawPath);
  if (metadataId) {
    return createYouTubeMetadataResponse(metadataId, rateLimitHeaders, true);
  }
  const { allowedDomains, targetResolution } = await resolveRequestTarget(request, rawPath, locals);
  if (targetResolution.status === 'invalid-target') {
    return new Response(null, {
      status: 400,
      headers: rateLimitHeaders,
    });
  }
  if (targetResolution.status === 'upstream-unavailable') {
    return createUpstreamUnavailableResponse(rateLimitHeaders, true);
  }
  const { targetUrl } = targetResolution;

  return buildProxyResponse(request, targetUrl, rateLimitHeaders, allowedDomains);
};
