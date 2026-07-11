import { describe, expect, test } from 'bun:test';
import { expectHttpOk } from './http-diagnostics';

interface MoodPost {
  id?: string;
  image?: string | null;
}

interface MoodApiResponse {
  posts?: MoodPost[];
}

function readEnv(name: string): string {
  return (process.env[name] ?? '').trim();
}

function getSiteUrl(): string {
  return readEnv('SITE_URL') || readEnv('PUBLIC_SITE_URL') || 'https://buxx.me';
}

function getSampleSize(): number {
  const raw = readEnv('HD_IMAGE_HEALTH_SAMPLE_SIZE');
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 8;
  }
  return parsed;
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

async function fetchMoodPage(siteUrl: string, timeoutMs: number): Promise<MoodApiResponse> {
  const response = await fetch(`${siteUrl}/api/moods`, {
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  await expectHttpOk(response, `GET ${siteUrl}/api/moods`);
  return await response.json() as MoodApiResponse;
}

function resolveImageUrl(siteUrl: string, imageUrl: string): string {
  return new URL(imageUrl, siteUrl).toString();
}

async function probeImage(siteUrl: string, post: ImagePost, timeoutMs: number): Promise<string | null> {
  const imageUrl = resolveImageUrl(siteUrl, post.image);

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

    return `${post.id}:${response.status}:${imageUrl}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown probe error';
    return `${post.id}:timeout:${message}:${imageUrl}`;
  }
}

describe('hd image health', () => {
  test('latest mood image URLs are readable', async () => {
    const siteUrl = getSiteUrl();
    const timeoutMs = getProbeTimeoutMs();
    const payload = await fetchMoodPage(siteUrl, timeoutMs);
    const imagePosts = (payload.posts ?? [])
      .filter((post): post is ImagePost => {
        return typeof post.id === 'string' && typeof post.image === 'string' && post.image.trim().length > 0;
      })
      .slice(0, getSampleSize());

    expect(imagePosts.length).toBeGreaterThan(0);

    const results = await Promise.all(imagePosts.map((post) => probeImage(siteUrl, post, timeoutMs)));
    const failures = results.filter((result): result is string => result !== null);

    expect(failures).toEqual([]);
  }, { timeout: getHealthTestTimeoutMs() });
});
interface ImagePost {
  id: string;
  image: string;
}
