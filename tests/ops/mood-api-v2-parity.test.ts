import { describe, expect, test } from 'bun:test';
import { expectHttpOk } from './http-diagnostics';

interface MoodPost {
  id?: string;
  datetime?: string;
  previewText?: string;
  previewHtml?: string;
  mediaHtml?: string;
  media?: Array<{ type?: string }>;
  image?: string | null;
  gallery?: unknown;
  reactions?: Array<{ emoji?: string; count?: string | number }>;
  commentsCount?: number | string;
}

interface MoodApiResponse {
  posts?: MoodPost[];
}

const ARCHIVE_WINDOWS = ['', '3600', '2000'];

function readEnv(name: string): string {
  return (process.env[name] ?? '').trim();
}

function getSiteUrl(): string {
  return (readEnv('SITE_URL') || readEnv('PUBLIC_SITE_URL') || 'https://buxx.me').replace(/\/+$/, '');
}

function getArchiveApiUrl(siteUrl: string): string {
  return readEnv('MOOD_ARCHIVE_API_URL') || new URL('/api/v2/mood', siteUrl).toString();
}

async function fetchArchiveMoodWindow(siteUrl: string, before: string): Promise<MoodPost[]> {
  const url = new URL(getArchiveApiUrl(siteUrl));
  url.searchParams.set('fresh', '1');
  url.searchParams.set('fallback', '0');
  if (before) {
    url.searchParams.set('before', before);
  }

  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
  });
  await expectHttpOk(response, `GET ${url}`);

  const payload = await response.json() as MoodApiResponse;
  return payload.posts ?? [];
}

async function fetchMoodProbe(siteUrl: string): Promise<{ latestId?: string }> {
  const url = new URL('/api/moods', siteUrl);
  url.searchParams.set('probe', '1');
  url.searchParams.set('fresh', '1');

  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
  });
  await expectHttpOk(response, `GET ${url}`);

  return await response.json() as { latestId?: string };
}

function isNumericId(value: unknown): value is string {
  return typeof value === 'string' && /^\d+$/.test(value);
}

function hasVisibleContentSignal(post: MoodPost): boolean {
  return Boolean(
    post.previewText?.trim()
    || post.previewHtml?.trim()
    || post.mediaHtml?.trim()
    || post.image
    || (post.media?.length ?? 0) > 0
    || (Array.isArray(post.gallery) && post.gallery.length > 0)
    || (post.reactions?.length ?? 0) > 0
    || Number(post.commentsCount ?? 0) > 0
  );
}

describe('mood data health', () => {
  test('canonical mood probe returns the latest live id', async () => {
    const siteUrl = getSiteUrl();
    const probe = await fetchMoodProbe(siteUrl);
    expect(isNumericId(probe.latestId), 'probe latestId should be a numeric mood id').toBe(true);
  }, { timeout: 10_000 });

  test('archive mood windows return user-facing data', async () => {
    const siteUrl = getSiteUrl();
    let checked = 0;
    let withContent = 0;

    for (const before of ARCHIVE_WINDOWS) {
      const posts = await fetchArchiveMoodWindow(siteUrl, before);
      expect(posts.length, `window before=${before || 'latest'} is empty`).toBeGreaterThan(0);

      for (const post of posts) {
        expect(isNumericId(post.id), `post id should be numeric: ${String(post.id)}`).toBe(true);
        if (post.datetime !== undefined) {
          expect(typeof post.datetime).toBe('string');
        }

        checked += 1;
        if (hasVisibleContentSignal(post)) {
          withContent += 1;
        }
      }
    }

    expect(checked, 'no archive mood posts were checked').toBeGreaterThan(0);
    expect(withContent, 'archive mood posts had no user-visible content signals').toBeGreaterThan(0);
  }, { timeout: 15_000 });
});
