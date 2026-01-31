/**
 * Telegram Bot Webhook Endpoint
 *
 * Receives channel_post updates from Telegram Bot API and stores
 * photo file_ids in Cloudflare KV for the HD image proxy.
 */

import type { APIRoute } from 'astro';

export const prerender = false;

const WEBHOOK_SECRET = import.meta.env.TELEGRAM_WEBHOOK_SECRET;
const CF_ACCOUNT_ID = import.meta.env.CLOUDFLARE_ACCOUNT_ID;
const CF_API_TOKEN = import.meta.env.CLOUDFLARE_API_TOKEN;
const KV_NAMESPACE_ID = import.meta.env.CLOUDFLARE_KV_NAMESPACE_ID;

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
}

interface TelegramUpdate {
  update_id: number;
  channel_post?: TelegramMessage;
}

/**
 * Write a key-value pair to Cloudflare KV via REST API
 */
async function writeToKV(key: string, value: string): Promise<boolean> {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN || !KV_NAMESPACE_ID) {
    console.error('Missing Cloudflare KV configuration');
    return false;
  }

  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${KV_NAMESPACE_ID}/values/${encodeURIComponent(key)}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'text/plain',
      },
      body: value,
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('KV write failed:', response.status, error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('KV write error:', error);
    return false;
  }
}

export const POST: APIRoute = async ({ request }) => {
  // Verify webhook secret token
  const secretToken = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (secretToken !== WEBHOOK_SECRET) {
    console.warn('Webhook unauthorized: invalid secret token');
    return new Response('Unauthorized', { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = await request.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const message = update.channel_post;

  // Only process posts with photos
  if (!message?.photo?.length) {
    return new Response('OK');
  }

  const postId = message.message_id.toString();

  // Photos array is sorted by size (smallest first), get the largest
  const photos = message.photo;
  const largestPhoto = photos[photos.length - 1];

  // For single images, store as index 0
  // For media groups, Telegram sends separate updates for each image
  // We use a simple approach: store each as index 0
  // A more sophisticated approach would track media_group_id
  const imageIndex = 0;
  const kvKey = `mood:${postId}:${imageIndex}`;

  const success = await writeToKV(kvKey, largestPhoto.file_id);

  if (success) {
    console.info(`Indexed image: ${kvKey} -> ${largestPhoto.file_id.substring(0, 20)}...`);
  }

  return new Response('OK');
};

// Return 405 for non-POST requests
export const ALL: APIRoute = async () => {
  return new Response('Method Not Allowed', { status: 405 });
};
