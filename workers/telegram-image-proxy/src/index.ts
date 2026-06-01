/**
 * Telegram HD Image Proxy Worker
 *
 * Serves Telegram images from R2, accepts authenticated ingest writes,
 * receives Telegram webhook events, and hands off immediate notify jobs.
 */

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface R2ObjectBody {
  body: ReadableStream<Uint8Array> | null;
  httpEtag: string;
  writeHttpMetadata(headers: Headers): void;
}

interface R2Bucket {
  put(
    key: string,
    value: ReadableStream<Uint8Array> | ArrayBuffer | ArrayBufferView | Blob | string,
    options?: {
      httpMetadata?: {
        contentType?: string;
        cacheControl?: string;
      };
      customMetadata?: Record<string, string>;
    }
  ): Promise<void>;
  get(key: string): Promise<R2ObjectBody | null>;
}

interface NotifyDispatchQueue {
  send(message: NotifyDispatchJob): Promise<void>;
}

interface QueueBatch<T> {
  messages: Array<{
    body: T;
  }>;
}

interface HtmlRewriterElement {
  getAttribute(name: string): string | null;
}

interface HtmlRewriterLike {
  on(selector: string, handlers: { element(element: HtmlRewriterElement): void }): HtmlRewriterLike;
  transform(response: Response): Response;
}

declare const HTMLRewriter:
  | (new () => HtmlRewriterLike)
  | undefined;

export interface NotifyDispatchJob {
  postId: string;
  deliveryModes: ['immediate'];
  source: 'telegram-webhook';
}

export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  HD_IMAGE_INGEST_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  NOTIFY_DISPATCH_SECRET: string;
  NOTIFY_DISPATCH_URL: string;
  CHANNEL: string;
  TELEGRAM_CHANNEL_ID: string;
  TELEGRAM_HOST: string;
  MOOD_IMAGES: R2Bucket;
  NOTIFY_DISPATCH_QUEUE: NotifyDispatchQueue;
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

interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

interface TelegramVideoMedia {
  cover?: TelegramPhotoSize[];
  thumbnail?: TelegramPhotoSize;
}

interface TelegramAnimationMedia {
  thumbnail?: TelegramPhotoSize;
}

interface TelegramDocumentMedia {
  thumbnail?: TelegramPhotoSize;
}

interface TelegramMessage {
  message_id: number;
  photo?: TelegramPhotoSize[];
  video?: TelegramVideoMedia;
  animation?: TelegramAnimationMedia;
  document?: TelegramDocumentMedia;
  media_group_id?: string;
  chat?: {
    id: number | string;
    photo?: {
      small_file_id?: string;
      big_file_id?: string;
    };
  };
}

interface TelegramUpdate {
  update_id: number;
  channel_post?: TelegramMessage;
}

interface TelegramGetChatResponse {
  ok: boolean;
  result?: {
    photo?: {
      small_file_id?: string;
      big_file_id?: string;
    };
  };
  description?: string;
}

interface MoodImageTarget {
  postId: string;
  imageIndex: number;
}

interface IngestPayload {
  fileId?: string;
}

interface CacheStorageWithDefault extends CacheStorage {
  default: Cache;
}

type ImageTarget = { objectKey: string; publicPath: string };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS, POST',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const CACHE_CONTROL = 'public, max-age=31536000, immutable, no-transform';
const VARIANT_WIDTHS = [480, 800, 1200, 1600] as const;
const VARIANT_QUALITY = 82;
const DEFAULT_IMAGE_CONTENT_TYPE = 'image/jpeg';

type CfImageRequestInit = RequestInit & {
  cf: {
    image: {
      width: number;
      fit: 'scale-down';
      quality: number;
    };
  };
};

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

function getVariantHeader(width: number | null): string {
  return width ? `w${width}` : 'original';
}

function normalizeImageContentType(value: string | null): string {
  const trimmed = value?.trim() ?? '';
  const type = trimmed.split(';', 1)[0]?.trim().toLowerCase() ?? '';

  if (!type || type === 'application/octet-stream' || type === 'binary/octet-stream') {
    return DEFAULT_IMAGE_CONTENT_TYPE;
  }

  return type === 'image/jpg' ? DEFAULT_IMAGE_CONTENT_TYPE : trimmed;
}

function hasAmbiguousImageContentType(value: string | null): boolean {
  const type = value?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  return !type || type === 'application/octet-stream' || type === 'binary/octet-stream';
}

function buildPublicUrl(target: ImageTarget, requestUrl: URL): string {
  return new URL(target.publicPath, requestUrl.origin).toString();
}

function timingSafeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
}

function trimTrailingSlash(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) {
    end -= 1;
  }
  return end === value.length ? value : value.slice(0, end);
}

function readBearerToken(request: Request): string {
  const authorization = request.headers.get('Authorization') ?? '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? '';
}

function resolveReadTarget(pathname: string): ImageTarget | null {
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

function resolveIngestTarget(pathname: string): ImageTarget | null {
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

function selectLargestPhoto(photos: TelegramPhotoSize[]): TelegramPhotoSize | null {
  if (!photos.length) return null;
  return photos.reduce((best, current) => {
    const bestArea = best.width * best.height;
    const currentArea = current.width * current.height;
    if (currentArea > bestArea) return current;
    if (currentArea < bestArea) return best;
    const bestSize = best.file_size ?? 0;
    const currentSize = current.file_size ?? 0;
    return currentSize > bestSize ? current : best;
  });
}

function selectMoodStaticImageFile(message: TelegramMessage): TelegramPhotoSize | null {
  const messagePhoto = selectLargestPhoto(message.photo ?? []);
  if (messagePhoto) {
    return messagePhoto;
  }

  const videoCover = selectLargestPhoto(message.video?.cover ?? []);
  if (videoCover) {
    return videoCover;
  }

  return message.video?.thumbnail ?? message.animation?.thumbnail ?? message.document?.thumbnail ?? null;
}

function extractMessageIdFromPhotoHref(href: string, channel: string, host: string): string {
  if (!href) return '';

  try {
    const parsed = new URL(href, `https://${host}`);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return '';

    const messageId = parts[parts.length - 1] ?? '';
    const channelSlug = parts[parts.length - 2] ?? '';
    if (channelSlug !== channel || !/^\d+$/.test(messageId)) {
      return '';
    }

    return messageId;
  } catch {
    return '';
  }
}

function resolveMoodImageTargetFromMediaHrefs(
  hrefs: string[],
  currentPostId: string,
  channel: string,
  host: string
): MoodImageTarget {
  const orderedPostIds: string[] = [];

  for (const href of hrefs) {
    const postId = extractMessageIdFromPhotoHref(href, channel, host);
    if (!postId || orderedPostIds.includes(postId)) {
      continue;
    }
    orderedPostIds.push(postId);
  }

  if (!orderedPostIds.length) {
    throw new Error(`No grouped media targets found for post ${currentPostId}`);
  }

  const imageIndex = orderedPostIds.indexOf(currentPostId);
  if (imageIndex === -1) {
    throw new Error(`Current media group item ${currentPostId} not found in embed markup`);
  }

  return {
    postId: orderedPostIds[0] ?? currentPostId,
    imageIndex,
  };
}

const MEDIA_GROUP_ITEM_CLASSES = new Set([
  'tgme_widget_message_photo_wrap',
  'tgme_widget_message_video_wrap',
  'tgme_widget_message_video_player',
  'tgme_widget_message_document_wrap',
]);

const MEDIA_GROUP_ITEM_SELECTOR = '.tgme_widget_message_photo_wrap, .tgme_widget_message_video_wrap, .tgme_widget_message_video_player, .tgme_widget_message_document_wrap';

function collectMediaHrefsWithFallback(html: string): string[] {
  const hrefs: string[] = [];

  for (const match of html.matchAll(/<a\b[^>]*>/gi)) {
    const tag = match[0];
    const className = tag.match(/\bclass\s*=\s*(['"])(.*?)\1/i)?.[2] ?? '';
    if (!className.split(/\s+/).some((token) => MEDIA_GROUP_ITEM_CLASSES.has(token))) {
      continue;
    }

    const href = tag.match(/\bhref\s*=\s*(['"])(.*?)\1/i)?.[2]?.trim() ?? '';
    if (href) {
      hrefs.push(href);
    }
  }

  return hrefs;
}

async function collectMediaHrefsWithRewriter(
  html: string,
  selector: string,
  HtmlRewriterCtor: new () => HtmlRewriterLike
): Promise<string[]> {
  const hrefs: string[] = [];
  const rewriter = new HtmlRewriterCtor()
    .on(selector, {
      element(element) {
        const href = element.getAttribute('href')?.trim() ?? '';
        if (href) {
          hrefs.push(href);
        }
      },
    });

  await rewriter.transform(new Response(html)).text();
  return hrefs;
}

async function collectMediaHrefsFromHtml(html: string): Promise<string[]> {
  const HtmlRewriterCtor = HTMLRewriter;
  if (typeof HtmlRewriterCtor === 'function') {
    return collectMediaHrefsWithRewriter(html, MEDIA_GROUP_ITEM_SELECTOR, HtmlRewriterCtor);
  }

  return collectMediaHrefsWithFallback(html);
}

async function resolveMoodImageTargetFromHtml(
  html: string,
  currentPostId: string,
  channel: string,
  host: string
): Promise<MoodImageTarget> {
  const hrefs = await collectMediaHrefsFromHtml(html);
  return resolveMoodImageTargetFromMediaHrefs(hrefs, currentPostId, channel, host);
}

async function resolveMoodImageTarget(message: TelegramMessage, env: Env): Promise<MoodImageTarget> {
  const currentPostId = String(message.message_id);
  if (!message.media_group_id) {
    return {
      postId: currentPostId,
      imageIndex: 0,
    };
  }

  const channel = env.CHANNEL?.trim();
  const host = env.TELEGRAM_HOST?.trim() || 't.me';
  if (!channel) {
    throw new Error('Missing CHANNEL configuration for media group indexing');
  }

  const url = `https://${host}/${channel}/${encodeURIComponent(currentPostId)}?embed=1&mode=tme`;
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (compatible; TelegramWebhook/1.0)',
    },
  });

  if (!response.ok) {
    throw new Error(`Telegram embed fetch failed: ${response.status}`);
  }

  const html = await response.text();
  return resolveMoodImageTargetFromHtml(html, currentPostId, channel, host);
}

async function fetchChannelAvatarFileId(channelId: string, env: Env): Promise<string | null> {
  if (!channelId || !env.TELEGRAM_BOT_TOKEN) {
    return null;
  }

  try {
    const getChatUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getChat?chat_id=${encodeURIComponent(channelId)}`;
    const response = await fetch(getChatUrl);
    if (!response.ok) {
      console.error('Telegram getChat failed for avatar indexing:', response.status);
      return null;
    }

    const payload = (await response.json()) as TelegramGetChatResponse;
    if (!payload.ok) {
      console.error('Telegram getChat response invalid for avatar indexing:', payload.description);
      return null;
    }

    const photo = payload.result?.photo;
    return photo?.big_file_id || photo?.small_file_id || null;
  } catch (error) {
    console.error('Telegram getChat request failed for avatar indexing:', error);
    return null;
  }
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
  target: ImageTarget,
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
  const contentType = normalizeImageContentType(originalResponse.headers.get('Content-Type'));

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

  const originalPublicUrl = buildPublicUrl(target, requestUrl);
  await Promise.all(
    VARIANT_WIDTHS.map(async (width) => {
      const variantRequestInit: CfImageRequestInit = {
        cf: {
          image: {
            width,
            fit: 'scale-down',
            quality: VARIANT_QUALITY,
          },
        },
      };
      const variantResponse = await fetch(originalPublicUrl, variantRequestInit);

      if (!variantResponse.ok || !variantResponse.body) {
        console.warn(`Variant generation failed for width ${width}:`, variantResponse.status);
        return;
      }

      const variantType = normalizeImageContentType(variantResponse.headers.get('Content-Type') || contentType);
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

  const cache = (caches as CacheStorageWithDefault).default;
  const cacheRequests = [null, ...VARIANT_WIDTHS].map((width) => {
    const cacheUrl = new URL(target.publicPath, requestUrl.origin);
    if (width) {
      cacheUrl.searchParams.set('w', String(width));
    }
    return new Request(cacheUrl.toString(), { method: 'GET' });
  });

  await Promise.all(cacheRequests.map((entry) => cache.delete(entry)));
}

async function generateMissingVariant(
  target: ImageTarget,
  variantWidth: number,
  requestUrl: URL,
  env: Env
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const variantRequestInit: CfImageRequestInit = {
    cf: {
      image: {
        width: variantWidth,
        fit: 'scale-down',
        quality: VARIANT_QUALITY,
      },
    },
  };

  const response = await fetch(buildPublicUrl(target, requestUrl), variantRequestInit);
  if (!response.ok) {
    console.warn(`On-demand variant generation failed for width ${variantWidth}:`, response.status);
    return null;
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.byteLength) {
    return null;
  }

  const contentType = normalizeImageContentType(response.headers.get('Content-Type'));
  await env.MOOD_IMAGES.put(getVariantObjectKey(target.objectKey, variantWidth), bytes, {
    httpMetadata: {
      contentType,
      cacheControl: CACHE_CONTROL,
    },
    customMetadata: {
      source: 'worker-read-repair',
      variant: `w${variantWidth}`,
      updatedAt: new Date().toISOString(),
    },
  });

  return { bytes, contentType };
}

async function ingestTelegramImage(
  target: ImageTarget,
  fileId: string,
  requestUrl: URL,
  env: Env,
  sourceLabel = 'telegram-bot'
): Promise<void> {
  const sourceImageUrl = await resolveTelegramImageUrl(fileId, env);
  if (!sourceImageUrl) {
    throw new Error('Failed to resolve image path from Telegram');
  }

  await ingestImageFromSource(target, sourceImageUrl, requestUrl, env, sourceLabel);
}

async function indexChannelAvatarInR2(message: TelegramMessage, requestUrl: URL, env: Env): Promise<void> {
  const channelId = message.chat?.id ? String(message.chat.id) : env.TELEGRAM_CHANNEL_ID?.trim();
  if (!channelId) {
    return;
  }

  const directAvatarFileId = message.chat?.photo?.big_file_id || message.chat?.photo?.small_file_id || '';
  const avatarFileId = directAvatarFileId || await fetchChannelAvatarFileId(channelId, env);
  if (!avatarFileId) {
    return;
  }

  await ingestTelegramImage(
    { objectKey: 'channel/avatar', publicPath: '/channel/avatar' },
    avatarFileId,
    requestUrl,
    env,
    'telegram-bot-avatar'
  );
}

function buildNotifyDispatchJob(postId: string): NotifyDispatchJob {
  return {
    postId,
    deliveryModes: ['immediate'],
    source: 'telegram-webhook',
  };
}

async function dispatchNotifyJob(job: NotifyDispatchJob, env: Env): Promise<void> {
  const endpoint = trimTrailingSlash(env.NOTIFY_DISPATCH_URL);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.NOTIFY_DISPATCH_SECRET}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      postId: job.postId,
      deliveryModes: job.deliveryModes,
    }),
  });

  if (response.ok) {
    return;
  }

  const bodyText = (await response.text()).slice(0, 500);
  throw new Error(`Notify dispatch failed with ${response.status}: ${bodyText}`);
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
    payload = await request.json() as IngestPayload;
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

async function handleWebhook(request: Request, url: URL, env: Env): Promise<Response> {
  const secretToken = request.headers.get('X-Telegram-Bot-Api-Secret-Token')?.trim() ?? '';
  if (!timingSafeEqual(secretToken, env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? '')) {
    return new Response('Unauthorized', { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = await request.json() as TelegramUpdate;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const message = update.channel_post;
  if (!message?.message_id) {
    return new Response('OK');
  }

  const messageId = String(message.message_id);
  let postId = messageId;
  let imageTarget: MoodImageTarget = { postId: messageId, imageIndex: 0 };
  const staticImageFile = selectMoodStaticImageFile(message);

  if (staticImageFile) {
    try {
      imageTarget = await resolveMoodImageTarget(message, env);
      postId = imageTarget.postId;
    } catch (error) {
      console.error(`Webhook media-group resolution failed for message ${messageId}:`, error);
      return new Response('Media-group resolution failed', { status: 503 });
    }
  }

  try {
    await indexChannelAvatarInR2(message, url, env);
  } catch (error) {
    console.error(`Webhook avatar ingest failed for post ${postId}:`, error);
  }

  if (staticImageFile) {
    try {
      await ingestTelegramImage(
        {
          objectKey: `mood/${postId}/${imageTarget.imageIndex}`,
          publicPath: `/mood/${postId}/${imageTarget.imageIndex}`,
        },
        staticImageFile.file_id,
        url,
        env
      );
    } catch (error) {
      console.error(`Webhook mood image ingest failed for post ${postId}/${imageTarget.imageIndex}:`, error);
    }
  }

  try {
    await env.NOTIFY_DISPATCH_QUEUE.send(buildNotifyDispatchJob(postId));
  } catch (error) {
    console.error(`Failed to enqueue notify dispatch for post ${postId}:`, error);
    return new Response('Notify queue unavailable', { status: 503 });
  }

  return new Response('OK');
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
  const cache = (caches as CacheStorageWithDefault).default;
  const cached = await cache.match(cacheRequest);
  if (cached) {
    if (variantWidth && cached.headers.get('X-Image-Variant') !== getVariantHeader(variantWidth)) {
      ctx.waitUntil(cache.delete(cacheRequest));
    } else if (hasAmbiguousImageContentType(cached.headers.get('Content-Type'))) {
      ctx.waitUntil(cache.delete(cacheRequest));
    } else {
      return cached;
    }
  }

  const variantHeader = getVariantHeader(variantWidth);

  const preferredKey = variantWidth ? getVariantObjectKey(target.objectKey, variantWidth) : target.objectKey;
  const preferredObject = await env.MOOD_IMAGES.get(preferredKey);
  if (preferredObject) {
    const headers = new Headers({
      'Content-Type': DEFAULT_IMAGE_CONTENT_TYPE,
      'Cache-Control': CACHE_CONTROL,
      ...corsHeaders,
    });
    preferredObject.writeHttpMetadata(headers);
    headers.set('Content-Type', normalizeImageContentType(headers.get('Content-Type')));
    headers.set('ETag', preferredObject.httpEtag);
    headers.set('Vary', 'Accept');
    headers.set('X-Image-Variant', variantHeader);

    const response = request.method === 'HEAD'
      ? new Response(null, { status: 200, headers })
      : new Response(preferredObject.body, { status: 200, headers });

    if (request.method === 'GET') {
      ctx.waitUntil(cache.put(cacheRequest, response.clone()));
    }

    return response;
  }

  const originalObject = await env.MOOD_IMAGES.get(target.objectKey);
  if (originalObject) {
    if (variantWidth) {
      const generated = await generateMissingVariant(target, variantWidth, url, env);
      if (generated) {
        const headers = new Headers({
          'Content-Type': normalizeImageContentType(generated.contentType),
          'Cache-Control': CACHE_CONTROL,
          'Vary': 'Accept',
          ...corsHeaders,
        });
        headers.set('X-Image-Variant', variantHeader);
        const response = request.method === 'HEAD'
          ? new Response(null, { status: 200, headers })
          : new Response(generated.bytes as unknown as BodyInit, { status: 200, headers });

        if (request.method === 'GET') {
          ctx.waitUntil(cache.put(cacheRequest, response.clone()));
        }

        return response;
      }
    }

    const headers = new Headers({
      'Content-Type': DEFAULT_IMAGE_CONTENT_TYPE,
      'Cache-Control': CACHE_CONTROL,
      ...corsHeaders,
    });
    originalObject.writeHttpMetadata(headers);
    headers.set('Content-Type', normalizeImageContentType(headers.get('Content-Type')));
    headers.set('ETag', originalObject.httpEtag);
    headers.set('Vary', 'Accept');
    if (variantWidth) {
      headers.set('X-Image-Variant', 'original-fallback');
    }

    return request.method === 'HEAD'
      ? new Response(null, { status: 200, headers })
      : new Response(originalObject.body, { status: 200, headers });
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

async function processQueueBatch(batch: QueueBatch<NotifyDispatchJob>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    const postId = message.body?.postId?.trim() ?? '';
    if (!postId) {
      console.warn('Dropping notify queue message without postId');
      continue;
    }

    try {
      await dispatchNotifyJob(message.body, env);
    } catch (error) {
      console.error('Notify queue dispatch failed:', {
        message: message.body,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method === 'POST') {
      if (url.pathname === '/webhook') {
        return handleWebhook(request, url, env);
      }
      return handleIngest(request, url, env);
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
    }

    return handleRead(request, url, env, ctx);
  },

  async queue(batch: QueueBatch<NotifyDispatchJob>, env: Env): Promise<void> {
    await processQueueBatch(batch, env);
  },
};
