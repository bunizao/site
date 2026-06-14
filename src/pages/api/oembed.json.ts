import type { APIRoute } from 'astro';
import {
  json,
  jsonBadRequest,
  jsonError,
  jsonTooManyRequests,
} from '@/lib/http/json-response';
import {
  readBooleanFlag,
  readEnumQuery,
  readIntQuery,
} from '@/lib/http/query';
import { withRateLimit } from '@/lib/http/rate-limited';
import {
  appendMoodApiModeQueryValue,
  readMoodApiModeQueryValue,
} from '@/features/mood/shared/api-mode';
import { getCorsHeaders } from '../../lib/embed-response';

export const prerender = false;

interface OEmbedResponse {
  type: 'rich';
  version: '1.0';
  title: string;
  provider_name: string;
  provider_url: string;
  width: number;
  height: number;
  html: string;
  cache_age?: number;
}

const DEFAULT_WIDTH = 400;
const DEFAULT_HEIGHT = 400;
const MIN_WIDTH = 200;
const MAX_WIDTH = 800;
const MIN_HEIGHT = 150;
const MAX_HEIGHT = 800;
const DEFAULT_COUNT = 5;
const MIN_COUNT = 1;
const MAX_COUNT = 10;
const DEFAULT_DENSITY = 'regular';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function estimateHeight(options: {
  count: number;
  hasLink: boolean;
  frame: boolean;
  density: 'regular' | 'compact';
}): number {
  const cardBase = options.density === 'compact' ? 132 : 164;
  const gap = options.frame ? 12 : 16;
  const padding = options.frame ? 16 : 0;
  const link = options.hasLink ? 28 : 0;
  const total = padding + options.count * cardBase + (options.count > 1 ? (options.count - 1) * gap : 0) + link;
  return Math.round(total);
}

function mergeHeaders(...sources: Array<HeadersInit | undefined>): Headers {
  const headers = new Headers();
  sources.forEach((source) => {
    if (!source) return;
    new Headers(source).forEach((value, key) => {
      headers.set(key, value);
    });
  });
  return headers;
}

export const GET: APIRoute = async ({ url, request, locals }) => {
  const corsHeaders = getCorsHeaders();
  const rateLimit = withRateLimit(
    request,
    { windowMs: 60_000, max: 120, prefix: 'api:oembed' },
    locals
  );

  if (!rateLimit.allowed) {
    return jsonTooManyRequests(mergeHeaders(corsHeaders, rateLimit.headers));
  }

  const requestedUrl = url.searchParams.get('url')?.trim() ?? '';
  if (!requestedUrl) {
    return jsonBadRequest('Missing required parameter: url', corsHeaders);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(requestedUrl);
  } catch {
    return jsonBadRequest('Invalid URL format', corsHeaders);
  }

  const isHttp = parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  if (!isHttp) {
    return jsonBadRequest('Unsupported URL protocol', corsHeaders);
  }

  const normalizeHost = (value: string): string => value.replace(/^www\\./i, '').toLowerCase();
  if (normalizeHost(parsedUrl.host) !== normalizeHost(url.host)) {
    return jsonError(403, 'URL host not allowed for embedding', corsHeaders);
  }

  const moodPath = parsedUrl.pathname.endsWith('/') && parsedUrl.pathname !== '/' ? parsedUrl.pathname.slice(0, -1) : parsedUrl.pathname;
  const moodListPath = moodPath === '/mood';
  const moodSegments = moodPath.split('/').filter(Boolean);
  const moodDetailId = moodSegments.length === 2 && moodSegments[0] === 'mood' ? moodSegments[1] : '';
  const isMoodUrl = moodListPath || Boolean(moodDetailId);
  if (!isMoodUrl) {
    return jsonError(404, 'URL not supported for embedding', corsHeaders);
  }

  const width = clamp(readIntQuery(url, 'maxwidth') ?? DEFAULT_WIDTH, MIN_WIDTH, MAX_WIDTH);
  const maxHeight = readIntQuery(url, 'maxheight');

  const theme = url.searchParams.get('theme') || 'auto';
  const count = clamp(readIntQuery(url, 'count') ?? DEFAULT_COUNT, MIN_COUNT, MAX_COUNT);
  const frameParam = url.searchParams.get('frame');
  const density = readEnumQuery(url, 'density', ['regular', 'compact'] as const, DEFAULT_DENSITY);
  const font = readEnumQuery(url, 'font', ['mono', 'system'] as const, 'mono');
  const originParam = url.searchParams.get('origin');
  const linkParam = url.searchParams.get('link');
  const apiModeQueryValue = readMoodApiModeQueryValue(url) ?? readMoodApiModeQueryValue(parsedUrl);
  const frame = readBooleanFlag(url, 'frame', true);
  const link = readBooleanFlag(url, 'link', true);
  const allowedOrigin = normalizeOrigin(originParam);
  const height = maxHeight !== null
    ? clamp(maxHeight || DEFAULT_HEIGHT, MIN_HEIGHT, MAX_HEIGHT)
    : clamp(
        estimateHeight({
          count: moodDetailId ? 1 : count,
          hasLink: link,
          frame,
          density,
        }),
        MIN_HEIGHT,
        MAX_HEIGHT
      );

  const baseUrl = `${url.protocol}//${url.host}`;
  const embedParams = new URLSearchParams();
  embedParams.set('theme', theme);
  if (moodDetailId) {
    embedParams.set('id', moodDetailId);
  } else {
    embedParams.set('count', String(count));
  }
  if (frameParam) {
    embedParams.set('frame', frameParam);
  }
  if (url.searchParams.has('density')) {
    embedParams.set('density', density);
  }
  if (url.searchParams.has('font')) {
    embedParams.set('font', font);
  }
  if (allowedOrigin) {
    embedParams.set('origin', allowedOrigin);
  }
  if (linkParam) {
    embedParams.set('link', linkParam);
  }
  appendMoodApiModeQueryValue(embedParams, apiModeQueryValue);

  const embedUrl = `${baseUrl}/mood/embed?${embedParams.toString()}`;

  const iframeId = `mood-embed-${Math.random().toString(36).slice(2, 9)}`;
  const iframeHtml = `<div style="margin:0 auto;text-align:center;"><iframe id="${iframeId}" src="${embedUrl}" width="${width}" height="${height}" frameborder="0" style="display:inline-block;width:${width}px;max-width:100%;height:${height}px;border:0;overflow:hidden;vertical-align:top;" loading="lazy" allowtransparency="true" title="Mood Embed"></iframe></div>`;
  const resizeScript = `<script>(function(){var iframe=document.getElementById('${iframeId}');if(!iframe)return;var allowedOrigin=null;try{var url=new URL(iframe.getAttribute('src')||'');var originParam=url.searchParams.get('origin');if(originParam){var parsed=new URL(originParam);allowedOrigin=parsed.origin;}}catch(e){}function onMessage(event){if(!event||!event.data||event.data.type!=='mood-embed-resize')return;if(event.source!==iframe.contentWindow)return;if(allowedOrigin&&event.origin!==allowedOrigin)return;var nextHeight=Number(event.data.height);if(!Number.isFinite(nextHeight)||nextHeight<=0)return;iframe.style.height=nextHeight+'px';}window.addEventListener('message',onMessage);})();</script>`;
  const embedHtml = `${iframeHtml}${resizeScript}`;

  const response: OEmbedResponse = {
    type: 'rich',
    version: '1.0',
    title: 'Mood Feed',
    provider_name: 'Bunizao',
    provider_url: baseUrl,
    width,
    height,
    html: embedHtml,
    cache_age: 3600,
  };

  return json(200, response, corsHeaders);
};

export const OPTIONS: APIRoute = async () => {
  const corsHeaders = getCorsHeaders();
  return new Response(null, { status: 204, headers: corsHeaders });
};
