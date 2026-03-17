import { describe, expect, test } from 'bun:test';

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

async function fetchMoodPage(siteUrl: string): Promise<MoodApiResponse> {
  const response = await fetch(`${siteUrl}/api/moods`, {
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
    },
  });

  expect(response.ok).toBe(true);
  return await response.json() as MoodApiResponse;
}

describe('hd image health', () => {
  test('latest mood image URLs are readable', async () => {
    const siteUrl = getSiteUrl();
    const payload = await fetchMoodPage(siteUrl);
    const imagePosts = (payload.posts ?? [])
      .filter((post): post is Required<Pick<MoodPost, 'id' | 'image'>> => {
        return typeof post.id === 'string' && typeof post.image === 'string' && post.image.trim().length > 0;
      })
      .slice(0, getSampleSize());

    expect(imagePosts.length).toBeGreaterThan(0);

    const failures: string[] = [];
    for (const post of imagePosts) {
      const response = await fetch(post.image, {
        method: 'HEAD',
        headers: {
          Accept: 'image/avif,image/webp,image/jpeg,image/*,*/*;q=0.8',
          'Cache-Control': 'no-cache',
        },
      });

      if (!response.ok) {
        failures.push(`${post.id}:${response.status}:${post.image}`);
      }
    }

    expect(failures).toEqual([]);
  });
});
