#!/usr/bin/env npx tsx
/**
 * Re-ingest R2 mood images through the Telegram bot API.
 *
 * Flow:
 * 1. List original image objects from R2 (`mood/<postId>/0`).
 * 2. Forward each historical channel message to a temp chat to recover `file_id`.
 * 3. Call the Worker ingest endpoint so the Worker fetches the original image via bot API.
 * 4. Verify R2 metadata reports `source=telegram-bot`.
 *
 * Required environment variables:
 *   TELEGRAM_BOT_TOKEN
 *   TELEGRAM_CHANNEL_ID
 *   TELEGRAM_TEMP_CHAT_ID
 *   PUBLIC_HD_IMAGE_URL
 *   HD_IMAGE_INGEST_TOKEN
 *   CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_GLOBAL_KEY
 *
 * Optional:
 *   CLOUDFLARE_AUTH_EMAIL
 *
 * Usage:
 *   CLOUDFLARE_GLOBAL_KEY=xxx npx tsx scripts/reingest-r2-from-telegram-bot.ts
 *   CLOUDFLARE_GLOBAL_KEY=xxx npx tsx scripts/reingest-r2-from-telegram-bot.ts --ids=3190,3188
 *   CLOUDFLARE_GLOBAL_KEY=xxx npx tsx scripts/reingest-r2-from-telegram-bot.ts --limit=50
 *   CLOUDFLARE_GLOBAL_KEY=xxx npx tsx scripts/reingest-r2-from-telegram-bot.ts --dry-run
 */

interface CliOptions {
  ids: string[];
  limit: number;
  concurrency: number;
  includeAvatar: boolean;
  dryRun: boolean;
}

interface TelegramPhotoSize {
  file_id: string;
  width: number;
  height: number;
  file_size?: number;
}

interface TelegramMessage {
  message_id: number;
  photo?: TelegramPhotoSize[];
}

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: {
    retry_after?: number;
  };
}

interface R2ObjectEntry {
  key: string;
  custom_metadata?: Record<string, string>;
}

interface ReingestResult {
  id: string;
  ok: boolean;
  verifyStatus: number;
  source?: string;
  reason?: string;
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID ?? '';
const TEMP_CHAT_ID = process.env.TELEGRAM_TEMP_CHAT_ID ?? '';
const HD_IMAGE_URL = (process.env.PUBLIC_HD_IMAGE_URL ?? '').replace(/\/+$/, '');
const HD_IMAGE_INGEST_TOKEN = process.env.HD_IMAGE_INGEST_TOKEN ?? '';
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
const CF_GLOBAL_KEY = process.env.CLOUDFLARE_GLOBAL_KEY ?? '';
const CF_AUTH_EMAIL = process.env.CLOUDFLARE_AUTH_EMAIL ?? 'bunizaoccc@gmail.com';

const BUCKET_NAME = 'mood-images';
const TELEGRAM_RETRY_COUNT = 4;
const TELEGRAM_RETRY_DELAY_MS = 1200;
const INGEST_POLL_ATTEMPTS = 20;
const INGEST_POLL_DELAY_MS = 1000;
const ACCEPTED_SOURCE_MARKERS = new Set(['telegram', 'telegram-bot']);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePositiveInt(raw: string, fallback: number): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    ids: [],
    limit: Number.POSITIVE_INFINITY,
    concurrency: 4,
    includeAvatar: true,
    dryRun: false,
  };

  for (const arg of args) {
    if (arg.startsWith('--ids=')) {
      options.ids = arg
        .slice('--ids='.length)
        .split(',')
        .map((part) => part.trim())
        .filter((part) => /^\d+$/.test(part));
      continue;
    }

    if (arg.startsWith('--limit=')) {
      options.limit = parsePositiveInt(arg.slice('--limit='.length), options.limit);
      continue;
    }

    if (arg.startsWith('--concurrency=')) {
      options.concurrency = parsePositiveInt(arg.slice('--concurrency='.length), options.concurrency);
      continue;
    }

    if (arg === '--no-avatar') {
      options.includeAvatar = false;
      continue;
    }

    if (arg === '--dry-run') {
      options.dryRun = true;
    }
  }

  return options;
}

function requireEnv(value: string, name: string): string {
  if (!value.trim()) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value.trim();
}

function pickLargestPhoto(photos: TelegramPhotoSize[]): TelegramPhotoSize | null {
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

async function cloudflareRequest(pathname: string, init?: RequestInit): Promise<any> {
  const accountId = requireEnv(CF_ACCOUNT_ID, 'CLOUDFLARE_ACCOUNT_ID');
  const globalKey = requireEnv(CF_GLOBAL_KEY, 'CLOUDFLARE_GLOBAL_KEY');
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}${pathname}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      'X-Auth-Email': CF_AUTH_EMAIL,
      'X-Auth-Key': globalKey,
      ...(init?.headers ?? {}),
    },
  });

  const payload = await response.json();
  if (!response.ok || !payload?.success) {
    throw new Error(`Cloudflare API failed: ${response.status} ${JSON.stringify(payload?.errors ?? payload)}`);
  }

  return payload;
}

async function listAllOriginalMoodIds(): Promise<string[]> {
  const ids = new Set<string>();
  let cursor = '';

  do {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    const payload = await cloudflareRequest(`/r2/buckets/${BUCKET_NAME}/objects${query}`);
    const objects = (payload?.result ?? []) as R2ObjectEntry[];

    for (const object of objects) {
      const match = /^mood\/(\d+)\/0$/.exec(object.key);
      if (!match) continue;
      ids.add(match[1]);
    }

    cursor = payload?.result_info?.is_truncated ? payload.result_info.cursor : '';
  } while (cursor);

  return Array.from(ids).sort((a, b) => Number.parseInt(b, 10) - Number.parseInt(a, 10));
}

async function getObjectSourceMap(): Promise<Map<string, string>> {
  const sources = new Map<string, string>();
  let cursor = '';

  do {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    const payload = await cloudflareRequest(`/r2/buckets/${BUCKET_NAME}/objects${query}`);
    const objects = (payload?.result ?? []) as R2ObjectEntry[];

    for (const object of objects) {
      const match = /^mood\/(\d+)\/0$/.exec(object.key);
      if (!match) continue;
      sources.set(match[1], object.custom_metadata?.source ?? '');
    }

    const avatar = objects.find((object) => object.key === 'channel/avatar');
    if (avatar) {
      sources.set('channel/avatar', avatar.custom_metadata?.source ?? '');
    }

    cursor = payload?.result_info?.is_truncated ? payload.result_info.cursor : '';
  } while (cursor);

  return sources;
}

async function telegramRequest<T>(method: string, body: unknown): Promise<TelegramResponse<T>> {
  const botToken = requireEnv(BOT_TOKEN, 'TELEGRAM_BOT_TOKEN');
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return await response.json() as TelegramResponse<T>;
}

async function withTelegramRetry<T>(callback: () => Promise<TelegramResponse<T>>): Promise<TelegramResponse<T>> {
  for (let attempt = 0; attempt <= TELEGRAM_RETRY_COUNT; attempt += 1) {
    const payload = await callback();
    if (payload.ok || payload.error_code !== 429 || attempt >= TELEGRAM_RETRY_COUNT) {
      return payload;
    }

    const retryAfterSeconds = payload.parameters?.retry_after ?? 1;
    await sleep(retryAfterSeconds * 1000 + TELEGRAM_RETRY_DELAY_MS);
  }

  throw new Error('Telegram retry exhausted');
}

async function recoverPhotoFileId(postId: string): Promise<string> {
  const tempChatId = requireEnv(TEMP_CHAT_ID, 'TELEGRAM_TEMP_CHAT_ID');
  const channelId = requireEnv(CHANNEL_ID, 'TELEGRAM_CHANNEL_ID');

  const forwarded = await withTelegramRetry<TelegramMessage>(() => {
    return telegramRequest<TelegramMessage>('forwardMessage', {
      chat_id: tempChatId,
      from_chat_id: channelId,
      message_id: Number.parseInt(postId, 10),
      disable_notification: true,
    });
  });

  if (!forwarded.ok || !forwarded.result) {
    throw new Error(forwarded.description || `forwardMessage failed for ${postId}`);
  }

  try {
    const largest = pickLargestPhoto(forwarded.result.photo ?? []);
    if (!largest?.file_id) {
      throw new Error(`No photo found on message ${postId}`);
    }

    return largest.file_id;
  } finally {
    await telegramRequest<boolean>('deleteMessage', {
      chat_id: tempChatId,
      message_id: forwarded.result.message_id,
    }).catch(() => undefined);
  }
}

async function recoverAvatarFileId(): Promise<string> {
  const channelId = requireEnv(CHANNEL_ID, 'TELEGRAM_CHANNEL_ID');
  const payload = await telegramRequest<{ photo?: { big_file_id?: string; small_file_id?: string } }>('getChat', {
    chat_id: channelId,
  });

  if (!payload.ok) {
    throw new Error(payload.description || 'getChat failed');
  }

  const fileId = payload.result?.photo?.big_file_id || payload.result?.photo?.small_file_id;
  if (!fileId) {
    throw new Error('Channel avatar file_id not found');
  }

  return fileId;
}

async function callIngest(pathname: string, fileId: string): Promise<void> {
  const ingestToken = requireEnv(HD_IMAGE_INGEST_TOKEN, 'HD_IMAGE_INGEST_TOKEN');
  const baseUrl = requireEnv(HD_IMAGE_URL, 'PUBLIC_HD_IMAGE_URL');
  const url = `${baseUrl}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ingestToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fileId }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ingest failed: ${response.status} ${text}`);
  }
}

async function verifyImage(pathname: string): Promise<number> {
  const baseUrl = requireEnv(HD_IMAGE_URL, 'PUBLIC_HD_IMAGE_URL');
  const url = new URL(`${baseUrl}${pathname.startsWith('/') ? pathname : `/${pathname}`}`);
  if (pathname.startsWith('/mood/')) {
    url.searchParams.set('w', '1200');
  }

  const response = await fetch(url, {
    method: 'HEAD',
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  });

  return response.status;
}

async function waitForImage(pathname: string): Promise<number> {
  let lastStatus = 0;

  for (let attempt = 0; attempt < INGEST_POLL_ATTEMPTS; attempt += 1) {
    lastStatus = await verifyImage(pathname);
    if (lastStatus === 200) {
      return lastStatus;
    }
    await sleep(INGEST_POLL_DELAY_MS);
  }

  return lastStatus;
}

async function reingestMood(postId: string, dryRun: boolean): Promise<ReingestResult> {
  try {
    const fileId = await recoverPhotoFileId(postId);
    if (!dryRun) {
      await callIngest(`/ingest/mood/${encodeURIComponent(postId)}/0`, fileId);
    }

    const verifyStatus = dryRun ? 0 : await waitForImage(`/mood/${postId}/0`);
    return { id: postId, ok: dryRun || verifyStatus === 200, verifyStatus };
  } catch (error) {
    return {
      id: postId,
      ok: false,
      verifyStatus: 0,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function reingestAvatar(dryRun: boolean): Promise<ReingestResult> {
  try {
    const fileId = await recoverAvatarFileId();
    if (!dryRun) {
      await callIngest('/ingest/channel/avatar', fileId);
    }

    const verifyStatus = dryRun ? 0 : await waitForImage('/channel/avatar');
    return { id: 'channel/avatar', ok: dryRun || verifyStatus === 200, verifyStatus };
  } catch (error) {
    return {
      id: 'channel/avatar',
      ok: false,
      verifyStatus: 0,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (limit <= 1) {
    const output: R[] = [];
    for (let index = 0; index < items.length; index += 1) {
      output.push(await worker(items[index], index));
    }
    return output;
  }

  const output = new Array<R>(items.length);
  let cursor = 0;

  const tasks = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }
      output[index] = await worker(items[index], index);
    }
  });

  await Promise.all(tasks);
  return output;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  requireEnv(BOT_TOKEN, 'TELEGRAM_BOT_TOKEN');
  requireEnv(CHANNEL_ID, 'TELEGRAM_CHANNEL_ID');
  requireEnv(TEMP_CHAT_ID, 'TELEGRAM_TEMP_CHAT_ID');
  requireEnv(HD_IMAGE_URL, 'PUBLIC_HD_IMAGE_URL');
  requireEnv(HD_IMAGE_INGEST_TOKEN, 'HD_IMAGE_INGEST_TOKEN');
  requireEnv(CF_ACCOUNT_ID, 'CLOUDFLARE_ACCOUNT_ID');
  requireEnv(CF_GLOBAL_KEY, 'CLOUDFLARE_GLOBAL_KEY');

  const beforeSources = await getObjectSourceMap();
  const ids = options.ids.length ? options.ids : await listAllOriginalMoodIds();
  const selectedIds = ids.slice(0, options.limit);

  console.log(JSON.stringify({
    dryRun: options.dryRun,
    includeAvatar: options.includeAvatar,
    concurrency: options.concurrency,
    totalMoodObjects: ids.length,
    selectedMoodObjects: selectedIds.length,
  }, null, 2));

  const results = await mapConcurrent(selectedIds, options.concurrency, async (postId) => {
    const result = await reingestMood(postId, options.dryRun);
    console.log(`mood/${postId}/0\tok=${result.ok}\tverify=${result.verifyStatus}${result.reason ? `\treason=${result.reason}` : ''}`);
    await sleep(250);
    return result;
  });

  if (options.includeAvatar) {
    const avatarResult = await reingestAvatar(options.dryRun);
    results.push(avatarResult);
    console.log(`channel/avatar\tok=${avatarResult.ok}\tverify=${avatarResult.verifyStatus}${avatarResult.reason ? `\treason=${avatarResult.reason}` : ''}`);
  }

  if (options.dryRun) {
    return;
  }

  const afterSources = await getObjectSourceMap();
  const auditedResults = results.map((result) => ({
    ...result,
    source: afterSources.get(result.id) ?? '',
    previousSource: beforeSources.get(result.id) ?? '',
  }));

  const failed = auditedResults.filter((result) => !result.ok || !ACCEPTED_SOURCE_MARKERS.has(result.source ?? ''));
  console.log('\nAudit summary');
  console.log(JSON.stringify({
    attempted: auditedResults.length,
    failed: failed.length,
    failedItems: failed.map((item) => ({
      id: item.id,
      verifyStatus: item.verifyStatus,
      source: item.source,
      previousSource: (item as any).previousSource,
      reason: item.reason,
    })),
  }, null, 2));

  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
