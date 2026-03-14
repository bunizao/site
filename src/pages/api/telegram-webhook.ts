/**
 * Telegram Bot Webhook Endpoint
 *
 * Receives channel_post updates from Telegram Bot API, dispatches
 * email notifications, and ingests Telegram photo bytes into the
 * R2-backed HD image proxy Worker.
 */

import type { APIRoute } from 'astro';
import { load } from 'cheerio';
import { dispatchMoodNotification } from '@/lib/notify/service';
import { getNotifyConfig } from '@/lib/notify/env';
import { secureCompareText } from '@/lib/notify/security';
import { checkRateLimit, createRateLimitHeaders } from '@/lib/security/rate-limit';

export const prerender = false;

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

interface MoodImageTarget {
  postId: string;
  imageIndex: number;
}

function readEnv(locals: any, name: string): string {
  const buildValue = import.meta.env[name];
  if (typeof buildValue === 'string' && buildValue.trim()) {
    return buildValue.trim();
  }

  const runtimeValue = locals?.runtime?.env?.[name] ?? locals?.env?.[name];
  if (typeof runtimeValue === 'string' && runtimeValue.trim()) {
    return runtimeValue.trim();
  }

  return '';
}

interface WebhookConfig {
  webhookSecret: string;
  telegramBotToken: string;
  telegramChannelId: string;
  hdImageIngestToken: string;
  hdImageBase: string;
}

function getWebhookConfig(locals: any): WebhookConfig {
  return {
    webhookSecret: readEnv(locals, 'TELEGRAM_WEBHOOK_SECRET'),
    telegramBotToken: readEnv(locals, 'TELEGRAM_BOT_TOKEN'),
    telegramChannelId: readEnv(locals, 'TELEGRAM_CHANNEL_ID'),
    hdImageIngestToken: readEnv(locals, 'HD_IMAGE_INGEST_TOKEN'),
    hdImageBase: readEnv(locals, 'PUBLIC_HD_IMAGE_URL').replace(/\/+$/, ''),
  };
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

async function resolveMoodImageTarget(message: TelegramMessage, locals?: any): Promise<MoodImageTarget> {
  const currentPostId = String(message.message_id);
  if (!message.media_group_id) {
    return {
      postId: currentPostId,
      imageIndex: 0,
    };
  }

  const channel = readEnv(locals, 'CHANNEL');
  const host = readEnv(locals, 'TELEGRAM_HOST') || 't.me';
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

export function resolveMoodImageTargetFromHtml(
  html: string,
  currentPostId: string,
  channel: string,
  host: string
): MoodImageTarget {
  const $ = load(html);
  const wrapper = $(`.tgme_widget_message[data-post="${channel}/${currentPostId}"]`).first();
  const photoNodes = (wrapper.length ? wrapper.find('.tgme_widget_message_photo_wrap') : $('.tgme_widget_message_photo_wrap')).toArray();
  const orderedPostIds: string[] = [];

  for (const node of photoNodes) {
    const postId = extractMessageIdFromPhotoHref($(node).attr('href') ?? '', channel, host);
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

async function fetchChannelAvatarFileId(channelId: string, config: WebhookConfig): Promise<string | null> {
  if (!channelId || !config.telegramBotToken) {
    return null;
  }

  try {
    const getChatUrl = `https://api.telegram.org/bot${config.telegramBotToken}/getChat?chat_id=${encodeURIComponent(channelId)}`;
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

async function indexChannelAvatarInR2(message: TelegramMessage, locals?: any): Promise<void> {
  const config = getWebhookConfig(locals);
  const channelId = message.chat?.id ? String(message.chat.id) : config.telegramChannelId;
  if (!channelId) {
    return;
  }

  const directAvatarFileId = message.chat?.photo?.big_file_id || message.chat?.photo?.small_file_id || '';
  const avatarFileId = directAvatarFileId || await fetchChannelAvatarFileId(channelId, config);
  if (!avatarFileId) {
    return;
  }

  const success = await ingestToImageWorker('/ingest/channel/avatar', avatarFileId, config);
  if (success) {
    console.info(`Ingested channel avatar: ${avatarFileId.slice(0, 20)}...`);
  }
}

/**
 * Trigger image ingest in the image proxy Worker.
 */
async function ingestToImageWorker(pathname: string, fileId: string, config: WebhookConfig): Promise<boolean> {
  if (!fileId) {
    return false;
  }

  if (!config.hdImageBase || !config.hdImageIngestToken) {
    console.error('Missing HD image ingest configuration');
    return false;
  }

  try {
    const url = `${config.hdImageBase}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.hdImageIngestToken}`,
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

function isValidWebhookToken(receivedToken: string | null, config: WebhookConfig): boolean {
  if (!receivedToken || !config.webhookSecret) {
    return false;
  }
  return secureCompareText(receivedToken, config.webhookSecret);
}

export const POST: APIRoute = async ({ request, locals }) => {
  const config = getWebhookConfig(locals);
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
  if (!isValidWebhookToken(secretToken, config)) {
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

  const messageId = message.message_id.toString();
  const imageTarget = message.photo?.length
    ? await resolveMoodImageTarget(message, locals)
    : { postId: messageId, imageIndex: 0 };
  const postId = imageTarget.postId;
  await indexChannelAvatarInR2(message, locals);

  // Only index image file_id when the post has photos
  if (message?.photo?.length) {
    // Pick the largest photo explicitly to avoid relying on ordering
    const largestPhoto = selectLargestPhoto(message.photo);
    if (largestPhoto) {
      const ingestPath = `/ingest/mood/${encodeURIComponent(postId)}/${imageTarget.imageIndex}`;
      const success = await ingestToImageWorker(ingestPath, largestPhoto.file_id, config);

      if (!success) {
        console.error(`Image ingest failed for post ${postId}/${imageTarget.imageIndex}`);
        return new Response('Image ingest failed', {
          status: 502,
          headers: rateLimitHeaders,
        });
      }

      console.info(
        `Ingested image: ${postId}/${imageTarget.imageIndex} from message ${messageId} -> ${largestPhoto.file_id.substring(0, 20)}...`
      );
    }
  }

  await triggerMoodDispatch({ request, locals }, postId);

  return new Response('OK', { headers: rateLimitHeaders });
};

// Return 405 for non-POST requests
export const ALL: APIRoute = async () => {
  return new Response('Method Not Allowed', { status: 405 });
};
