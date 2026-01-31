import type { APIRoute } from 'astro';
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export const GET: APIRoute = async ({ url, request }) => {
  const corsHeaders = getCorsHeaders();

  const params = url.searchParams;
  const requestedUrl = params.get('url');

  // Validate URL parameter
  if (!requestedUrl) {
    return new Response(
      JSON.stringify({ error: 'Missing required parameter: url' }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...Object.fromEntries(corsHeaders),
        },
      }
    );
  }

  // Parse and validate the URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(requestedUrl);
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid URL format' }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...Object.fromEntries(corsHeaders),
        },
      }
    );
  }

  const isHttp = parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  if (!isHttp) {
    return new Response(
      JSON.stringify({ error: 'Unsupported URL protocol' }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...Object.fromEntries(corsHeaders),
        },
      }
    );
  }

  const normalizeHost = (value: string): string => value.replace(/^www\\./i, '').toLowerCase();
  if (normalizeHost(parsedUrl.host) !== normalizeHost(url.host)) {
    return new Response(
      JSON.stringify({ error: 'URL host not allowed for embedding' }),
      {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          ...Object.fromEntries(corsHeaders),
        },
      }
    );
  }

  // Check if URL is for our mood page
  const moodPath = parsedUrl.pathname.endsWith('/') && parsedUrl.pathname !== '/' ? parsedUrl.pathname.slice(0, -1) : parsedUrl.pathname;
  const moodListPath = moodPath === '/mood';
  const moodSegments = moodPath.split('/').filter(Boolean);
  const moodDetailId = moodSegments.length === 2 && moodSegments[0] === 'mood' ? moodSegments[1] : '';
  const isMoodUrl = moodListPath || Boolean(moodDetailId);
  if (!isMoodUrl) {
    return new Response(
      JSON.stringify({ error: 'URL not supported for embedding' }),
      {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          ...Object.fromEntries(corsHeaders),
        },
      }
    );
  }

  // Parse dimension parameters
  const maxWidth = params.get('maxwidth');
  const maxHeight = params.get('maxheight');
  const width = maxWidth ? clamp(parseInt(maxWidth, 10) || DEFAULT_WIDTH, MIN_WIDTH, MAX_WIDTH) : DEFAULT_WIDTH;
  const height = maxHeight ? clamp(parseInt(maxHeight, 10) || DEFAULT_HEIGHT, MIN_HEIGHT, MAX_HEIGHT) : DEFAULT_HEIGHT;

  // Parse embed-specific parameters
  const theme = params.get('theme') || 'auto';
  const countParam = params.get('count');
  const count = countParam ? clamp(parseInt(countParam, 10) || DEFAULT_COUNT, MIN_COUNT, MAX_COUNT) : DEFAULT_COUNT;

  // Build embed URL
  const baseUrl = `${url.protocol}//${url.host}`;
  const embedParams = new URLSearchParams();
  embedParams.set('theme', theme);
  if (moodDetailId) {
    embedParams.set('id', moodDetailId);
  } else {
    embedParams.set('count', String(count));
  }

  const embedUrl = `${baseUrl}/mood/embed?${embedParams.toString()}`;

  // Generate iframe HTML
  const iframeHtml = `<iframe src="${embedUrl}" width="${width}" height="${height}" frameborder="0" style="border:none;overflow:hidden;" loading="lazy" allowtransparency="true"></iframe>`;

  const response: OEmbedResponse = {
    type: 'rich',
    version: '1.0',
    title: 'Mood Feed',
    provider_name: 'Bunizao',
    provider_url: baseUrl,
    width,
    height,
    html: iframeHtml,
    cache_age: 3600,
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...Object.fromEntries(corsHeaders),
    },
  });
};

export const OPTIONS: APIRoute = async () => {
  const corsHeaders = getCorsHeaders();
  return new Response(null, { status: 204, headers: corsHeaders });
};
