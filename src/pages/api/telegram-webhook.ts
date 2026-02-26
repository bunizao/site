/**
 * Telegram Bot Webhook Endpoint
 *
 * Receives channel_post updates from Telegram Bot API, dispatches
 * email notifications, and ingests Telegram photo bytes into the
 * R2-backed HD image proxy Worker.
 */

import type { APIRoute } from 'astro';
import { dispatchMoodNotification } from '@/lib/notify/service';
import { getNotifyConfig } from '@/lib/notify/env';
import { secureCompareText } from '@/lib/notify/security';
import { checkRateLimit, createRateLimitHeaders } from '@/lib/security/rate-limit';

export const prerender = false;

const WEBHOOK_SECRET = import.meta.env.TELEGRAM_WEBHOOK_SECRET;
const TELEGRAM_BOT_TOKEN = import.meta.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHANNEL_ID = import.meta.env.TELEGRAM_CHANNEL_ID;
const HD_IMAGE_URL = import.meta.env.PUBLIC_HD_IMAGE_URL;
const HD_IMAGE_INGEST_TOKEN = import.meta.env.HD_IMAGE_INGEST_TOKEN;
const HD_IMAGE_BASE = HD_IMAGE_URL?.replace(/\/+$/, '') ?? '';

interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

interface TelegramMessage {
  message_id: number;
  photo?: TelegramPhotoSize[];
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

async function fetchChannelAvatarFileId(channelId: string): Promise<string | null> {
  if (!channelId || !TELEGRAM_BOT_TOKEN) {
    return null;
  }

  try {
    const getChatUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getChat?chat_id=${encodeURIComponent(channelId)}`;
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

async function indexChannelAvatarInR2(message: TelegramMessage): Promise<void> {
  const channelId = message.chat?.id ? String(message.chat.id) : TELEGRAM_CHANNEL_ID || '';
  if (!channelId) {
    return;
  }

  const directAvatarFileId = message.chat?.photo?.big_file_id || message.chat?.photo?.small_file_id || '';
  const avatarFileId = directAvatarFileId || await fetchChannelAvatarFileId(channelId);
  if (!avatarFileId) {
    return;
  }

  const success = await ingestToImageWorker('/ingest/channel/avatar', avatarFileId);
  if (success) {
    console.info(`Ingested channel avatar: ${avatarFileId.slice(0, 20)}...`);
  }
}

/**
 * Trigger image ingest in the image proxy Worker.
 */
async function ingestToImageWorker(pathname: string, fileId: string): Promise<boolean> {
  if (!fileId) {
    return false;
  }

  if (!HD_IMAGE_BASE || !HD_IMAGE_INGEST_TOKEN) {
    console.error('Missing HD image ingest configuration');
    return false;
  }

  try {
    const url = `${HD_IMAGE_BASE}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HD_IMAGE_INGEST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fileId }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Image ingest failed:', response.status, error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Image ingest request failed:', error);
    return false;
  }
}

async function triggerMoodDispatch(context: { request: Request; locals?: any }, postId: string): Promise<void> {
  const notifyConfig = getNotifyConfig({ locals: context.locals });
  const notifyEnabled = Boolean(
    notifyConfig.resendApiKey &&
    notifyConfig.notifyFrom &&
    notifyConfig.tokenSecret &&
    notifyConfig.cloudflareAccountId &&
    notifyConfig.cloudflareApiToken &&
    notifyConfig.cloudflareNotifyD1DatabaseId
  );

  if (!notifyEnabled) {
    return;
  }

  try {
    const result = await dispatchMoodNotification(context, postId, {
      deliveryModes: ['immediate'],
    });
    if (result.failed > 0) {
      console.warn(`Mood notify dispatch finished with failures for post ${postId}:`, result);
    }
  } catch (error) {
    console.error(`Mood notify dispatch failed for post ${postId}:`, error);
  }
}

function isValidWebhookToken(receivedToken: string | null): boolean {
  if (!receivedToken || !WEBHOOK_SECRET) {
    return false;
  }
  return secureCompareText(receivedToken, WEBHOOK_SECRET);
}

export const POST: APIRoute = async ({ request, locals }) => {
  const rateLimit = checkRateLimit(
    request,
    { windowMs: 60_000, max: 180, prefix: 'api:telegram:webhook' },
    locals
  );
  const rateLimitHeaders = createRateLimitHeaders(rateLimit);
  if (!rateLimit.allowed) {
    return new Response('Too Many Requests', {
      status: 429,
      headers: rateLimitHeaders,
    });
  }

  // Verify webhook secret token
  const secretToken = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (!isValidWebhookToken(secretToken)) {
    console.warn('Webhook unauthorized: invalid secret token');
    return new Response('Unauthorized', { status: 401, headers: rateLimitHeaders });
  }

  let update: TelegramUpdate;
  try {
    update = await request.json();
  } catch {
    return new Response('Invalid JSON', { status: 400, headers: rateLimitHeaders });
  }

  const message = update.channel_post;
  if (!message?.message_id) {
    return new Response('OK', { headers: rateLimitHeaders });
  }

  const postId = message.message_id.toString();
  await triggerMoodDispatch({ request, locals }, postId);
  await indexChannelAvatarInR2(message);

  // Only index image file_id when the post has photos
  if (!message?.photo?.length) {
    return new Response('OK', { headers: rateLimitHeaders });
  }

  // Pick the largest photo explicitly to avoid relying on ordering
  const largestPhoto = selectLargestPhoto(message.photo);
  if (!largestPhoto) {
    return new Response('OK', { headers: rateLimitHeaders });
  }

  // For single images, store as index 0
  // For media groups, Telegram sends separate updates for each image
  // We use a simple approach: store each as index 0
  // A more sophisticated approach would track media_group_id
  const imageIndex = 0;
  const ingestPath = `/ingest/mood/${encodeURIComponent(postId)}/${imageIndex}`;
  const success = await ingestToImageWorker(ingestPath, largestPhoto.file_id);

  if (success) {
    console.info(`Ingested image: ${postId}/${imageIndex} -> ${largestPhoto.file_id.substring(0, 20)}...`);
  }

  return new Response('OK', { headers: rateLimitHeaders });
};

// Return 405 for non-POST requests
export const ALL: APIRoute = async () => {
  return new Response('Method Not Allowed', { status: 405 });
};
