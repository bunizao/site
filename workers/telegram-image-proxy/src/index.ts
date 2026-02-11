/**
 * Telegram HD Image Proxy Worker
 *
 * Proxies high-resolution images from Telegram Bot API with edge caching.
 * Images are looked up by post ID and image index from KV storage.
 */

interface Env {
  TELEGRAM_BOT_TOKEN: string;
  MOOD_IMAGES: KVNamespace;
}

interface TelegramFileResponse {
  ok: boolean;
  result?: {
    file_id: string;
    file_unique_id: string;
    file_size?: number;
    file_path?: string;
  };
  description?: string;
}

const MAX_WIDTH = 2048;
const DEFAULT_QUALITY = 82;
const MIN_QUALITY = 40;
const MAX_QUALITY = 95;

// CORS headers for cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const parsePositiveInt = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const clampNumber = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Only allow GET and HEAD
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
    }

    let cacheKey = '';

    // Route: /mood/:postId/:imageIndex
    const moodMatch = url.pathname.match(/^\/mood\/(\d+)\/(\d+)$/);
    if (moodMatch) {
      const [, postId, imageIndex] = moodMatch;
      cacheKey = `mood:${postId}:${imageIndex}`;
    } else if (url.pathname === '/channel/avatar') {
      // Route: /channel/avatar
      cacheKey = 'channel:avatar';
    } else {
      return new Response('Not Found. Use /mood/:postId/:imageIndex or /channel/avatar', {
        status: 404,
        headers: corsHeaders,
      });
    }

    // 1. Check edge cache first
    const cache = caches.default;
    const cacheRequest = new Request(url.toString(), request);
    const cached = await cache.match(cacheRequest);
    if (cached) {
      return cached;
    }

    // 2. Look up file_id from KV
    const fileId = await env.MOOD_IMAGES.get(cacheKey);
    if (!fileId) {
      return new Response('Image not indexed. Post may be too old or has no images.', {
        status: 404,
        headers: corsHeaders,
      });
    }

    // 3. Call Telegram Bot API getFile to get file_path
    const getFileUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`;
    const fileInfoResponse = await fetch(getFileUrl);

    if (!fileInfoResponse.ok) {
      console.error('Telegram getFile failed:', fileInfoResponse.status);
      return new Response('Telegram API error', {
        status: 502,
        headers: corsHeaders,
      });
    }

    const fileInfo: TelegramFileResponse = await fileInfoResponse.json();

    if (!fileInfo.ok || !fileInfo.result?.file_path) {
      console.error('Telegram getFile response invalid:', fileInfo.description);
      return new Response('Failed to retrieve file path from Telegram', {
        status: 502,
        headers: corsHeaders,
      });
    }

    // 4. Fetch the actual image from Telegram file server
    const imageUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${fileInfo.result.file_path}`;
    const widthParam = parsePositiveInt(url.searchParams.get('w') ?? url.searchParams.get('width'));
    const qualityParam = parsePositiveInt(url.searchParams.get('q'));
    const resizeWidth = widthParam ? Math.min(widthParam, MAX_WIDTH) : null;
    const resizeQuality = qualityParam
      ? clampNumber(qualityParam, MIN_QUALITY, MAX_QUALITY)
      : DEFAULT_QUALITY;

    let imageResponse: Response;
    if (resizeWidth) {
      imageResponse = await fetch(imageUrl, {
        cf: {
          image: {
            width: resizeWidth,
            fit: 'scale-down',
            quality: resizeQuality,
            format: 'auto',
          },
        },
      });

      if (!imageResponse.ok) {
        imageResponse = await fetch(imageUrl);
      }
    } else {
      imageResponse = await fetch(imageUrl);
    }

    if (!imageResponse.ok) {
      console.error('Failed to fetch image:', imageResponse.status);
      return new Response('Failed to fetch image from Telegram', {
        status: 502,
        headers: corsHeaders,
      });
    }

    // 5. Build response with cache headers
    const contentType = imageResponse.headers.get('Content-Type') || 'image/jpeg';
    const headers = new Headers({
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable, no-transform',
      ...corsHeaders,
    });
    headers.set('Vary', 'Accept');

    const response = new Response(imageResponse.body, {
      status: 200,
      headers,
    });

    // 6. Store in edge cache (async, don't await)
    const cacheableResponse = response.clone();
    cache.put(cacheRequest, cacheableResponse).catch((err) => {
      console.error('Cache put failed:', err);
    });

    return response;
  },
};
