import { describe, expect, test } from 'bun:test';
import type { MoodImageProbe } from '@bunizao/contracts';
import { expectHttpOk } from './http-diagnostics';

function readEnv(name: string): string {
  return (process.env[name] ?? '').trim();
}

function getSiteUrl(): string {
  return readEnv('SITE_URL') || readEnv('PUBLIC_SITE_URL') || 'https://buxx.me';
}

function getProbeTimeoutMs(): number {
  const raw = readEnv('HD_IMAGE_HEALTH_TIMEOUT_MS');
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 4_000;
  }
  return parsed;
}

function getHealthTestTimeoutMs(): number {
  return Math.max(15_000, getProbeTimeoutMs() * 2 + 3_000);
}

async function fetchLatestImage(siteUrl: string, timeoutMs: number): Promise<MoodImageProbe | null> {
  const url = new URL('/api/v2/mood', siteUrl);
  url.searchParams.set('probe', 'image');
  url.searchParams.set('fresh', '1');
  url.searchParams.set('fallback', '0');
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  await expectHttpOk(response, `GET ${url}`);
  return readMoodImageProbe(await response.json());
}

function readMoodImageProbe(value: unknown): MoodImageProbe | null {
  if (!value || typeof value !== 'object') return null;

  const latestImage = (value as Record<string, unknown>).latestImage;
  return isMoodImageProbe(latestImage) ? latestImage : null;
}

function isMoodImageProbe(value: unknown): value is MoodImageProbe {
  if (!value || typeof value !== 'object') return false;

  const image = value as Record<string, unknown>;
  return typeof image.id === 'string'
    && /^\d+$/.test(image.id)
    && typeof image.datetime === 'string'
    && image.datetime.length > 0
    && (image.url === null || typeof image.url === 'string')
    && typeof image.r2Ready === 'boolean';
}

function resolveImageUrl(siteUrl: string, imageUrl: string): string {
  return new URL(imageUrl, siteUrl).toString();
}

async function probeImage(
  siteUrl: string,
  image: MoodImageProbe,
  timeoutMs: number,
): Promise<string | null> {
  if (!image.url) {
    return `${image.id}:missing-r2-url`;
  }

  const imageUrl = resolveImageUrl(siteUrl, image.url);

  try {
    const response = await fetch(imageUrl, {
      method: 'HEAD',
      headers: {
        Accept: 'image/avif,image/webp,image/jpeg,image/*,*/*;q=0.8',
        'Cache-Control': 'no-cache',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    const contentType = response.headers.get('content-type') ?? '';
    if (response.ok && contentType.startsWith('image/')) {
      return null;
    }

    return `${image.id}:${response.status}:${contentType || 'missing-content-type'}:${imageUrl}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown probe error';
    return `${image.id}:timeout:${message}:${imageUrl}`;
  }
}

describe('hd image health', () => {
  test('latest archived mood image is stored in R2', async () => {
    const siteUrl = getSiteUrl();
    const timeoutMs = getProbeTimeoutMs();
    const image = await fetchLatestImage(siteUrl, timeoutMs);

    expect(image, 'image probe should return the latest archived photo').not.toBeNull();
    expect(image?.r2Ready, 'latest archived photo should exist in R2').toBe(true);
    expect(image?.url, 'latest archived photo should expose its R2 URL').toBeTruthy();
    if (!image?.r2Ready || !image.url) return;

    const failure = await probeImage(siteUrl, image, timeoutMs);
    expect(failure).toBeNull();
  }, { timeout: getHealthTestTimeoutMs() });
});
