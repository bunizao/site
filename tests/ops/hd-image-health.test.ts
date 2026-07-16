import { describe, expect, test } from 'bun:test';
import { expectHttpOk } from './http-diagnostics';

interface MoodImageProbe {
  id?: string;
  datetime?: string;
  url?: string;
}

interface MoodImageProbeResponse {
  latestImage?: MoodImageProbe | null;
}

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
  const payload = await response.json() as MoodImageProbeResponse;
  return payload.latestImage ?? null;
}

function resolveImageUrl(siteUrl: string, imageUrl: string): string {
  return new URL(imageUrl, siteUrl).toString();
}

async function probeImage(siteUrl: string, image: LatestMoodImage, timeoutMs: number): Promise<string | null> {
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

    if (response.ok) {
      return null;
    }

    return `${image.id}:${response.status}:${imageUrl}`;
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
    expect(image?.id, 'image probe id should be numeric').toMatch(/^\d+$/);
    expect(image?.datetime, 'image probe datetime should be populated').toBeTruthy();
    expect(image?.url, 'image probe URL should be populated').toBeTruthy();

    const failure = await probeImage(siteUrl, image as LatestMoodImage, timeoutMs);
    expect(failure).toBeNull();
  }, { timeout: getHealthTestTimeoutMs() });
});

interface LatestMoodImage {
  id: string;
  datetime: string;
  url: string;
}
