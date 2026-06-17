import { describe, expect, test } from 'bun:test';

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

const LIVE_WINDOWS = ['', '3600', '2000'];

function readEnv(name: string): string {
  return (process.env[name] ?? '').trim();
}

function getSiteUrl(): string {
  return (readEnv('SITE_URL') || readEnv('PUBLIC_SITE_URL') || 'https://buxx.me').replace(/\/+$/, '');
}

function getArchiveApiUrl(): string {
  return readEnv('MOOD_ARCHIVE_API_URL');
}

async function fetchMoodWindow(siteUrl: string, before: string): Promise<MoodPost[]> {
  const url = new URL('/api/moods', siteUrl);
  url.searchParams.set('fresh', '1');
  if (before) {
    url.searchParams.set('before', before);
  }

  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
  });
  expect(response.ok, `GET ${url} -> ${response.status}`).toBe(true);

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
  expect(response.ok, `GET ${url} -> ${response.status}`).toBe(true);

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readArchiveRecords(payload: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }

  if (!isRecord(payload)) {
    return null;
  }

  for (const key of ['posts', 'items', 'data', 'results']) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value.filter(isRecord);
    }
  }

  return null;
}

function hasStructuredArchiveSignal(record: Record<string, unknown>): boolean {
  return [
    'id',
    'text',
    'entities',
    'media',
    'forward',
    'reply_to',
    'reactions',
    'raw',
  ].some((key) => key in record);
}

describe('mood API taxonomy health', () => {
  test('canonical mood reads return live user-facing data', async () => {
    const siteUrl = getSiteUrl();
    const probe = await fetchMoodProbe(siteUrl);
    expect(isNumericId(probe.latestId), 'probe latestId should be a numeric mood id').toBe(true);

    let checked = 0;
    let withContent = 0;

    for (const before of LIVE_WINDOWS) {
      const posts = await fetchMoodWindow(siteUrl, before);
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

    expect(checked, 'no live mood posts were checked').toBeGreaterThan(0);
    expect(withContent, 'live mood posts had no user-visible content signals').toBeGreaterThan(0);
  }, { timeout: 30_000 });

  test('archive mood route returns structured JSON when configured', async () => {
    const archiveUrl = getArchiveApiUrl();
    if (!archiveUrl) {
      return;
    }

    const response = await fetch(archiveUrl, {
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
    });
    expect(response.ok, `GET ${archiveUrl} -> ${response.status}`).toBe(true);

    const payload = await response.json();
    const records = readArchiveRecords(payload);
    expect(records, 'archive response should expose a records array').not.toBeNull();
    expect(records!.length, 'archive response returned no records').toBeGreaterThan(0);
    expect(
      records!.some(hasStructuredArchiveSignal),
      'archive records should include structured mood fields',
    ).toBe(true);
  }, { timeout: 15_000 });
});
