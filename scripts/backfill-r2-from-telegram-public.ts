#!/usr/bin/env npx tsx
/**
 * Backfill missing mood images into R2 from Telegram public pages.
 *
 * It scans mood posts, probes image availability from the image Worker,
 * fetches the public Telegram CDN image for failed IDs, and uploads bytes
 * into R2 as `mood/<postId>/0`.
 *
 * Usage examples:
 *   npx tsx scripts/backfill-r2-from-telegram-public.ts
 *   npx tsx scripts/backfill-r2-from-telegram-public.ts --pages=20 --max-fixes=100
 *   npx tsx scripts/backfill-r2-from-telegram-public.ts --ids=3122,3123
 *   npx tsx scripts/backfill-r2-from-telegram-public.ts --dry-run
 */

import { load } from 'cheerio';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

interface CliOptions {
  siteUrl: string;
  imageBaseUrl: string;
  telegramChannel: string;
  pages: number;
  timeoutMs: number;
  concurrency: number;
  repairConcurrency: number;
  repairPauseMs: number;
  telegramRetry: number;
  telegramRetryDelayMs: number;
  maxFixes: number;
  bucketName: string;
  workerDir: string;
  ids: string[];
  failedOutput: string;
  dryRun: boolean;
}

interface MoodApiResponse {
  posts?: Array<{
    id?: string;
    image?: string | null;
  }>;
}

interface ProbeResult {
  postId: string;
  status: number;
  durationMs: number;
}

interface RepairResult {
  postId: string;
  probeStatus: number;
  sourceUrl?: string;
  uploadOk: boolean;
  verifyStatus: number;
  reason?: string;
}

const CACHE_CONTROL = 'public, max-age=31536000, immutable, no-transform';
const PROBE_RETRY_COUNT = 2;
const PROBE_RETRY_DELAY_MS = 300;

const DEFAULT_OPTIONS: CliOptions = {
  siteUrl: 'https://buxx.me',
  imageBaseUrl: 'https://image.buxx.me',
  telegramChannel: 'tutumood',
  pages: 12,
  timeoutMs: 12000,
  concurrency: 3,
  repairConcurrency: 1,
  repairPauseMs: 500,
  telegramRetry: 4,
  telegramRetryDelayMs: 900,
  maxFixes: 80,
  bucketName: 'mood-images',
  workerDir: 'workers/telegram-image-proxy',
  ids: [],
  failedOutput: '',
  dryRun: false,
};

function parsePositiveInt(raw: string, fallback: number): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { ...DEFAULT_OPTIONS };

  for (const arg of args) {
    if (arg.startsWith('--site=')) {
      options.siteUrl = arg.slice('--site='.length).replace(/\/+$/, '');
      continue;
    }
    if (arg.startsWith('--image-base=')) {
      options.imageBaseUrl = arg.slice('--image-base='.length).replace(/\/+$/, '');
      continue;
    }
    if (arg.startsWith('--channel=')) {
      options.telegramChannel = arg.slice('--channel='.length).trim();
      continue;
    }
    if (arg.startsWith('--pages=')) {
      options.pages = parsePositiveInt(arg.slice('--pages='.length), options.pages);
      continue;
    }
    if (arg.startsWith('--timeout-ms=')) {
      options.timeoutMs = parsePositiveInt(arg.slice('--timeout-ms='.length), options.timeoutMs);
      continue;
    }
    if (arg.startsWith('--concurrency=')) {
      options.concurrency = parsePositiveInt(arg.slice('--concurrency='.length), options.concurrency);
      continue;
    }
    if (arg.startsWith('--repair-concurrency=')) {
      options.repairConcurrency = parsePositiveInt(arg.slice('--repair-concurrency='.length), options.repairConcurrency);
      continue;
    }
    if (arg.startsWith('--repair-pause-ms=')) {
      options.repairPauseMs = parsePositiveInt(arg.slice('--repair-pause-ms='.length), options.repairPauseMs);
      continue;
    }
    if (arg.startsWith('--telegram-retry=')) {
      options.telegramRetry = parsePositiveInt(arg.slice('--telegram-retry='.length), options.telegramRetry);
      continue;
    }
    if (arg.startsWith('--telegram-retry-delay-ms=')) {
      options.telegramRetryDelayMs = parsePositiveInt(arg.slice('--telegram-retry-delay-ms='.length), options.telegramRetryDelayMs);
      continue;
    }
    if (arg.startsWith('--max-fixes=')) {
      options.maxFixes = parsePositiveInt(arg.slice('--max-fixes='.length), options.maxFixes);
      continue;
    }
    if (arg.startsWith('--bucket=')) {
      options.bucketName = arg.slice('--bucket='.length).trim();
      continue;
    }
    if (arg.startsWith('--worker-dir=')) {
      options.workerDir = arg.slice('--worker-dir='.length).trim();
      continue;
    }
    if (arg.startsWith('--ids=')) {
      const rawIds = arg.slice('--ids='.length).trim();
      options.ids = rawIds
        .split(',')
        .map((part) => part.trim())
        .filter((part) => /^\d+$/.test(part));
      continue;
    }
    if (arg.startsWith('--failed-output=')) {
      options.failedOutput = arg.slice('--failed-output='.length).trim();
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
  }

  options.siteUrl = options.siteUrl.replace(/\/+$/, '');
  options.imageBaseUrl = options.imageBaseUrl.replace(/\/+$/, '');
  options.workerDir = path.resolve(process.cwd(), options.workerDir);

  return options;
}

function nowMs(): number {
  return performance.now();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url: string, init: RequestInit | undefined, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function shouldRetryStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function computeRetryDelay(baseDelayMs: number, attempt: number): number {
  const jitterMs = Math.floor(Math.random() * 250);
  return baseDelayMs * (2 ** attempt) + jitterMs;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit | undefined,
  timeoutMs: number,
  retryCount: number,
  retryDelayMs: number
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, init, timeoutMs);
      if (attempt < retryCount && shouldRetryStatus(response.status)) {
        await sleep(computeRetryDelay(retryDelayMs, attempt));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt >= retryCount) {
        throw error;
      }
      await sleep(computeRetryDelay(retryDelayMs, attempt));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Retry exhausted');
}

function normalizeTelegramUrl(url: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }
  return trimmed;
}

function extractBackgroundUrl(style: string): string {
  if (!style) return '';
  const match = style.match(/url\((['"]?)(.*?)\1\)/i);
  return normalizeTelegramUrl(match?.[2] ?? '');
}

function extractImageIds(payload: MoodApiResponse): string[] {
  const ids: string[] = [];

  for (const post of payload.posts ?? []) {
    const postId = (post.id ?? '').trim();
    if (!/^\d+$/.test(postId)) continue;

    const image = (post.image ?? '').trim();
    if (!image) continue;
    if (/\/mood\/\d+\/0(?:\?|$)/i.test(image)) {
      ids.push(postId);
    }
  }

  return ids;
}

async function fetchMoodPage(siteUrl: string, before: string, timeoutMs: number): Promise<MoodApiResponse> {
  const url = before ? `${siteUrl}/api/moods?before=${encodeURIComponent(before)}` : `${siteUrl}/api/moods`;
  const response = await fetchWithTimeout(
    url,
    {
      headers: {
        Accept: 'application/json',
      },
    },
    timeoutMs
  );

  if (!response.ok) {
    throw new Error(`Mood API request failed: ${response.status}`);
  }

  return await response.json() as MoodApiResponse;
}

async function collectPostIds(options: CliOptions): Promise<string[]> {
  if (options.ids.length) {
    return Array.from(new Set(options.ids));
  }

  const found = new Set<string>();
  let before = '';

  for (let page = 0; page < options.pages; page += 1) {
    const payload = await fetchMoodPage(options.siteUrl, before, options.timeoutMs);
    for (const id of extractImageIds(payload)) {
      found.add(id);
    }

    const numericIds = (payload.posts ?? [])
      .map((post) => Number.parseInt(post.id ?? '', 10))
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((a, b) => a - b);

    if (!numericIds.length) {
      break;
    }

    before = String(numericIds[0]);
  }

  return Array.from(found).sort((a, b) => Number.parseInt(b, 10) - Number.parseInt(a, 10));
}

async function probeImage(imageBaseUrl: string, postId: string, timeoutMs: number): Promise<ProbeResult> {
  const url = `${imageBaseUrl}/mood/${postId}/0?w=1200`;
  const requestInit: RequestInit = {
    method: 'HEAD',
    headers: {
      Accept: 'image/avif,image/webp,image/jpeg,image/*,*/*;q=0.8',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  };

  for (let attempt = 0; attempt <= PROBE_RETRY_COUNT; attempt += 1) {
    const started = nowMs();
    try {
      const response = await fetchWithTimeout(url, requestInit, timeoutMs);
      const durationMs = nowMs() - started;
      const shouldRetry = response.status >= 500 && response.status <= 599;
      if (shouldRetry && attempt < PROBE_RETRY_COUNT) {
        await sleep(PROBE_RETRY_DELAY_MS);
        continue;
      }
      return { postId, status: response.status, durationMs };
    } catch {
      const durationMs = nowMs() - started;
      if (attempt < PROBE_RETRY_COUNT) {
        await sleep(PROBE_RETRY_DELAY_MS);
        continue;
      }
      return { postId, status: 0, durationMs };
    }
  }

  return { postId, status: 0, durationMs: 0 };
}

async function extractTelegramPhotoUrl(
  channel: string,
  postId: string,
  timeoutMs: number,
  retryCount: number,
  retryDelayMs: number
): Promise<string> {
  const escapedChannel = encodeURIComponent(channel);
  const escapedPostId = encodeURIComponent(postId);
  const pageCandidates = [
    `https://t.me/s/${escapedChannel}/${escapedPostId}`,
    `https://t.me/${escapedChannel}/${escapedPostId}?single`,
    `https://t.me/${escapedChannel}/${escapedPostId}`,
  ];

  const parsePhotoFromHtml = (html: string): string => {
    const $ = load(html);

    const exactSelector = `.tgme_widget_message[data-post="${channel}/${postId}"]`;
    const exactMessage = $(exactSelector).first();
    if (exactMessage.length > 0) {
      const exactWrap = exactMessage.closest('.tgme_widget_message_wrap');
      const exactPhoto = exactWrap.find('.tgme_widget_message_photo_wrap').first();
      const exactStyle = exactPhoto.attr('style') ?? '';
      const exactPhotoUrl = extractBackgroundUrl(exactStyle);
      if (exactPhotoUrl) return exactPhotoUrl;
    }

    const directHrefSelector = `a.tgme_widget_message_photo_wrap[href*="/${channel}/${postId}"]`;
    const directPhoto = $(directHrefSelector).first();
    if (directPhoto.length > 0) {
      const style = directPhoto.attr('style') ?? '';
      const photoUrl = extractBackgroundUrl(style);
      if (photoUrl) return photoUrl;
    }

    const singlePagePhoto = $('.tgme_widget_message_photo_wrap').first();
    if (singlePagePhoto.length > 0) {
      const style = singlePagePhoto.attr('style') ?? '';
      const photoUrl = extractBackgroundUrl(style);
      if (photoUrl) return photoUrl;
    }

    return '';
  };

  const requestHeaders = {
    Accept: 'text/html,application/xhtml+xml',
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent': 'Mozilla/5.0 (compatible; MoodImageBackfill/1.0)',
  };

  const errors: string[] = [];
  for (const candidateUrl of pageCandidates) {
    try {
      const response = await fetchWithRetry(
        candidateUrl,
        { headers: requestHeaders },
        timeoutMs,
        retryCount,
        retryDelayMs
      );

      if (!response.ok) {
        errors.push(`${candidateUrl} -> ${response.status}`);
        continue;
      }

      const html = await response.text();
      const photoUrl = parsePhotoFromHtml(html);
      if (photoUrl) {
        return photoUrl;
      }
      errors.push(`${candidateUrl} -> no-photo`);
    } catch (error) {
      errors.push(`${candidateUrl} -> ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`Photo URL not found on Telegram pages: ${errors.join(' | ')}`);
}

function pickContentType(raw: string | null): string {
  const value = (raw ?? '').split(';')[0]?.trim().toLowerCase();
  if (!value || !value.startsWith('image/')) {
    return 'image/jpeg';
  }
  return value;
}

async function runCommand(cmd: string, args: string[], cwd: string): Promise<{ ok: boolean; output: string }> {
  return await new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    child.stdout.on('data', (chunk) => {
      output += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      output += String(chunk);
    });

    child.on('error', (error) => {
      resolve({ ok: false, output: String(error) });
    });

    child.on('close', (code) => {
      resolve({ ok: code === 0, output });
    });
  });
}

async function uploadToR2(
  options: CliOptions,
  postId: string,
  contentType: string,
  filePath: string
): Promise<{ ok: boolean; output: string }> {
  const objectKey = `mood/${postId}/0`;
  const bucketTarget = `${options.bucketName}/${objectKey}`;

  return await runCommand(
    'bunx',
    [
      'wrangler',
      'r2',
      'object',
      'put',
      bucketTarget,
      '--remote',
      '--file',
      filePath,
      '--content-type',
      contentType,
      '--cache-control',
      CACHE_CONTROL,
    ],
    options.workerDir
  );
}

async function repairOne(options: CliOptions, probe: ProbeResult): Promise<RepairResult> {
  const base: RepairResult = {
    postId: probe.postId,
    probeStatus: probe.status,
    uploadOk: false,
    verifyStatus: probe.status,
  };

  let sourceUrl = '';
  try {
    sourceUrl = await extractTelegramPhotoUrl(
      options.telegramChannel,
      probe.postId,
      options.timeoutMs,
      options.telegramRetry,
      options.telegramRetryDelayMs
    );
  } catch (error) {
    return {
      ...base,
      reason: `extract source failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (options.dryRun) {
    return {
      ...base,
      sourceUrl,
      uploadOk: true,
      verifyStatus: probe.status,
      reason: 'dry-run',
    };
  }

  let tempPath = '';
  try {
    const imageResponse = await fetchWithRetry(
      sourceUrl,
      {
        headers: {
          Accept: 'image/avif,image/webp,image/jpeg,image/*,*/*;q=0.8',
          Referer: `https://t.me/${options.telegramChannel}`,
          'User-Agent': 'Mozilla/5.0 (compatible; MoodImageBackfill/1.0)',
        },
      },
      options.timeoutMs,
      options.telegramRetry,
      options.telegramRetryDelayMs
    );

    if (!imageResponse.ok) {
      return {
        ...base,
        sourceUrl,
        reason: `download failed: ${imageResponse.status}`,
      };
    }

    const bytes = new Uint8Array(await imageResponse.arrayBuffer());
    if (!bytes.byteLength) {
      return {
        ...base,
        sourceUrl,
        reason: 'download failed: empty body',
      };
    }

    const contentType = pickContentType(imageResponse.headers.get('content-type'));

    tempPath = path.join(os.tmpdir(), `mood-backfill-${probe.postId}-${randomUUID()}.img`);
    await fs.writeFile(tempPath, bytes);

    const uploadResult = await uploadToR2(options, probe.postId, contentType, tempPath);
    if (!uploadResult.ok) {
      return {
        ...base,
        sourceUrl,
        reason: `upload failed: ${uploadResult.output.trim() || 'unknown error'}`,
      };
    }

    await sleep(250);
    const verify = await probeImage(options.imageBaseUrl, probe.postId, options.timeoutMs);

    return {
      ...base,
      sourceUrl,
      uploadOk: true,
      verifyStatus: verify.status,
      reason: verify.status === 200 ? undefined : `verify failed: ${verify.status}`,
    };
  } catch (error) {
    return {
      ...base,
      sourceUrl,
      reason: `repair failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    if (tempPath) {
      await fs.unlink(tempPath).catch(() => undefined);
    }
  }
}

async function mapConcurrent<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  if (limit <= 1) {
    const output: R[] = [];
    for (let i = 0; i < items.length; i += 1) {
      output.push(await worker(items[i], i));
    }
    return output;
  }

  const output: R[] = new Array(items.length);
  let cursor = 0;

  const tasks = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const current = cursor;
      cursor += 1;
      if (current >= items.length) {
        return;
      }
      output[current] = await worker(items[current], current);
    }
  });

  await Promise.all(tasks);
  return output;
}

function shouldRepair(status: number): boolean {
  return status !== 200;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  console.log('Backfill run options:');
  console.log(JSON.stringify(options, null, 2));

  const postIds = await collectPostIds(options);
  if (!postIds.length) {
    console.log('No candidate IDs found.');
    if (options.failedOutput) {
      await fs.writeFile(options.failedOutput, '');
      console.log(`Failed IDs written: ${options.failedOutput} (0)`);
    }
    return;
  }

  console.log(`Collected ${postIds.length} post IDs.`);

  const probes = await mapConcurrent(postIds, options.concurrency, async (postId) => {
    const result = await probeImage(options.imageBaseUrl, postId, options.timeoutMs);
    console.log(`Probe ${postId}: status=${result.status}, duration=${result.durationMs.toFixed(1)}ms`);
    return result;
  });

  const failed = probes.filter((probe) => shouldRepair(probe.status));
  if (!failed.length) {
    console.log('All probed images are healthy (status 200).');
    if (options.failedOutput) {
      await fs.writeFile(options.failedOutput, '');
      console.log(`Failed IDs written: ${options.failedOutput} (0)`);
    }
    return;
  }

  const selected = failed.slice(0, options.maxFixes);
  console.log(`Need repair: ${failed.length}. Planned in this run: ${selected.length}.`);

  const repaired = await mapConcurrent(selected, Math.max(1, options.repairConcurrency), async (probe) => {
    console.log(`Repair start ${probe.postId} (status=${probe.status})`);
    const result = await repairOne(options, probe);
    if (options.repairPauseMs > 0) {
      await sleep(options.repairPauseMs);
    }

    const reason = result.reason ? `, reason=${result.reason}` : '';
    console.log(
      `Repair done ${probe.postId}: uploadOk=${result.uploadOk}, verifyStatus=${result.verifyStatus}${reason}`
    );

    return result;
  });

  const success = repaired.filter((item) => item.uploadOk && item.verifyStatus === 200).length;
  const failedRepairs = repaired.length - success;

  console.log('\nBackfill summary:');
  console.log(`- Probed IDs: ${probes.length}`);
  console.log(`- Initial non-200: ${failed.length}`);
  console.log(`- Attempted repairs: ${repaired.length}`);
  console.log(`- Successful repairs: ${success}`);
  console.log(`- Failed repairs: ${failedRepairs}`);

  if (failedRepairs > 0) {
    console.log('\nFailed items:');
    for (const item of repaired.filter((entry) => !(entry.uploadOk && entry.verifyStatus === 200))) {
      console.log(
        `- ${item.postId}: probe=${item.probeStatus}, verify=${item.verifyStatus}, reason=${item.reason ?? 'unknown'}`
      );
    }
  }

  if (options.failedOutput) {
    const failedLines = repaired
      .filter((entry) => !(entry.uploadOk && entry.verifyStatus === 200))
      .map((entry) => entry.postId);

    await fs.writeFile(options.failedOutput, failedLines.join('\n'));
    console.log(`Failed IDs written: ${options.failedOutput} (${failedLines.length})`);
  }
}

main().catch((error) => {
  console.error('Backfill script failed:', error);
  process.exitCode = 1;
});
