/**
 * Telegram HD Image Proxy Worker
 *
 * Serves Telegram images from R2 with edge caching.
 * New images are ingested via authenticated POST routes.
 */

interface Env {
  TELEGRAM_BOT_TOKEN: string;
  HD_IMAGE_INGEST_TOKEN: string;
  MOOD_IMAGES: R2Bucket;
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

interface IngestPayload {
  fileId?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS, POST',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const CACHE_CONTROL = 'public, max-age=31536000, immutable, no-transform';
const VARIANT_WIDTHS = [480, 800, 1200, 1600] as const;
const VARIANT_QUALITY = 82;

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function pickVariantWidth(width: number): number {
  for (const candidate of VARIANT_WIDTHS) {
    if (width <= candidate) {
      return candidate;
    }
  }
  return VARIANT_WIDTHS[VARIANT_WIDTHS.length - 1];
}

function getVariantObjectKey(baseKey: string, width: number): string {
  return `${baseKey}@w${width}`;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
}

function readBearerToken(request: Request): string {
  const authorization = request.headers.get('Authorization') ?? '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? '';
}

function resolveReadTarget(pathname: string): { objectKey: string; publicPath: string } | null {
  const moodMatch = pathname.match(/^\/mood\/(\d+)\/(\d+)$/);
  if (moodMatch) {
    const [, postId, imageIndex] = moodMatch;
    return {
      objectKey: `mood/${postId}/${imageIndex}`,
      publicPath: `/mood/${postId}/${imageIndex}`,
    };
  }

  if (pathname === '/channel/avatar') {
    return {
      objectKey: 'channel/avatar',
      publicPath: '/channel/avatar',
    };
  }

  return null;
}

function resolveIngestTarget(pathname: string): { objectKey: string; publicPath: string } | null {
  const moodMatch = pathname.match(/^\/ingest\/mood\/(\d+)\/(\d+)$/);
  if (moodMatch) {
    const [, postId, imageIndex] = moodMatch;
    return {
      objectKey: `mood/${postId}/${imageIndex}`,
      publicPath: `/mood/${postId}/${imageIndex}`,
    };
  }

  if (pathname === '/ingest/channel/avatar') {
    return {
      objectKey: 'channel/avatar',
      publicPath: '/channel/avatar',
    };
  }

  return null;
}

async function resolveTelegramImageUrl(fileId: string, env: Env): Promise<string | null> {
  const getFileUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`;
  const fileInfoResponse = await fetch(getFileUrl);

  if (!fileInfoResponse.ok) {
    console.error('Telegram getFile failed:', fileInfoResponse.status);
    return null;
  }

  const fileInfo: TelegramFileResponse = await fileInfoResponse.json();
  if (!fileInfo.ok || !fileInfo.result?.file_path) {
    console.error('Telegram getFile response invalid:', fileInfo.description);
    return null;
  }

  return `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${fileInfo.result.file_path}`;
}

async function ingestImageFromSource(
  target: { objectKey: string; publicPath: string },
  sourceImageUrl: string,
  requestUrl: URL,
  env: Env,
  sourceLabel: string
): Promise<void> {
  const originalResponse = await fetch(sourceImageUrl);
  if (!originalResponse.ok || !originalResponse.body) {
    throw new Error(`Failed to fetch image from Telegram: ${originalResponse.status}`);
  }

  const updatedAt = new Date().toISOString();
  const contentType = originalResponse.headers.get('Content-Type') || 'image/jpeg';

  await env.MOOD_IMAGES.put(target.objectKey, originalResponse.body, {
    httpMetadata: {
      contentType,
      cacheControl: CACHE_CONTROL,
    },
    customMetadata: {
      source: sourceLabel,
      variant: 'original',
      updatedAt,
    },
  });

  await Promise.all(
    VARIANT_WIDTHS.map(async (width) => {
      const variantResponse = await fetch(sourceImageUrl, {
        cf: {
          image: {
            width,
            fit: 'scale-down',
            quality: VARIANT_QUALITY,
          },
        },
      });

      if (!variantResponse.ok || !variantResponse.body) {
        console.warn(`Variant generation failed for width ${width}:`, variantResponse.status);
        return;
      }

      const variantType = variantResponse.headers.get('Content-Type') || contentType;
      await env.MOOD_IMAGES.put(getVariantObjectKey(target.objectKey, width), variantResponse.body, {
        httpMetadata: {
          contentType: variantType,
          cacheControl: CACHE_CONTROL,
        },
        customMetadata: {
          source: sourceLabel,
          variant: `w${width}`,
          updatedAt,
        },
      });
    })
  );

  const cache = caches.default;
  const cacheRequests = [null, ...VARIANT_WIDTHS].map((width) => {
    const cacheUrl = new URL(target.publicPath, requestUrl.origin);
    if (width) {
      cacheUrl.searchParams.set('w', String(width));
    }
    return new Request(cacheUrl.toString(), { method: 'GET' });
  });

  await Promise.all(cacheRequests.map((entry) => cache.delete(entry)));
}

async function ingestTelegramImage(
  target: { objectKey: string; publicPath: string },
  fileId: string,
  requestUrl: URL,
  env: Env
): Promise<void> {
  const sourceImageUrl = await resolveTelegramImageUrl(fileId, env);
  if (!sourceImageUrl) {
    throw new Error('Failed to resolve image path from Telegram');
  }

  await ingestImageFromSource(target, sourceImageUrl, requestUrl, env, 'telegram-bot');
}

async function handleIngest(request: Request, url: URL, env: Env): Promise<Response> {
  const target = resolveIngestTarget(url.pathname);
  if (!target) {
    return new Response('Not Found', { status: 404, headers: corsHeaders });
  }

  const token = readBearerToken(request);
  if (!token || !env.HD_IMAGE_INGEST_TOKEN || !timingSafeEqual(token, env.HD_IMAGE_INGEST_TOKEN)) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders });
  }

  let payload: IngestPayload;
  try {
    payload = await request.json<IngestPayload>();
  } catch {
    return new Response('Invalid JSON body', { status: 400, headers: corsHeaders });
  }

  const fileId = typeof payload.fileId === 'string' ? payload.fileId.trim() : '';
  if (!fileId) {
    return new Response('Missing fileId', { status: 400, headers: corsHeaders });
  }

  try {
    await ingestTelegramImage(target, fileId, url, env);
  } catch (error) {
    console.error('Ingest task failed:', error);
    return new Response(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : 'Ingest failed',
      key: target.objectKey,
    }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  }

  return new Response(JSON.stringify({ ok: true, key: target.objectKey }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

async function handleRead(request: Request, url: URL, env: Env, ctx: ExecutionContext): Promise<Response> {
  const target = resolveReadTarget(url.pathname);
  if (!target) {
    return new Response('Not Found. Use /mood/:postId/:imageIndex or /channel/avatar', {
      status: 404,
      headers: corsHeaders,
    });
  }

  const requestedWidth = parsePositiveInt(url.searchParams.get('w') ?? url.searchParams.get('width'));
  const variantWidth = requestedWidth ? pickVariantWidth(requestedWidth) : null;

  const cacheUrl = new URL(target.publicPath, url.origin);
  if (variantWidth) {
    cacheUrl.searchParams.set('w', String(variantWidth));
  }
  const cacheRequest = new Request(cacheUrl.toString(), request);
  const cache = caches.default;
  const cached = await cache.match(cacheRequest);
  if (cached) {
    return cached;
  }

  const preferredKey = variantWidth ? getVariantObjectKey(target.objectKey, variantWidth) : target.objectKey;
  const object = await env.MOOD_IMAGES.get(preferredKey) ?? await env.MOOD_IMAGES.get(target.objectKey);
  if (object) {
    const headers = new Headers({
      'Content-Type': 'image/jpeg',
      'Cache-Control': CACHE_CONTROL,
      ...corsHeaders,
    });
    object.writeHttpMetadata(headers);
    headers.set('ETag', object.httpEtag);
    headers.set('Vary', 'Accept');

    const response = request.method === 'HEAD'
      ? new Response(null, { status: 200, headers })
      : new Response(object.body, { status: 200, headers });

    if (request.method === 'GET') {
      ctx.waitUntil(cache.put(cacheRequest, response.clone()));
    }

    return response;
  }

  if (request.method === 'HEAD') {
    return new Response(null, {
      status: 404,
      headers: corsHeaders,
    });
  }

  return new Response('Image not available. Post may be too old or has no images.', {
    status: 404,
    headers: corsHeaders,
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method === 'POST') {
      return handleIngest(request, url, env);
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
    }

    return handleRead(request, url, env, ctx);
  },
};
