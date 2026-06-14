import { describe, expect, test } from 'bun:test';
import type { MediaItem } from '@bunizao/contracts';

interface MoodPost {
  id?: string;
  previewMediaType?: string;
  media?: MediaItem[];
  mediaHtml?: string;
  quote?: {
    text?: string;
    author?: string;
    href?: string;
    thumbnailSrc?: string;
  } | null;
  image?: string | null;
  gallery?: unknown;
  needsDetailPage?: boolean;
  commentsCount?: number | string;
}

interface MoodApiResponse {
  posts?: MoodPost[];
}

interface ParitySample {
  kind: string;
  before: string;
  id: string;
  label: string;
  assertLegacy(post: MoodPost): void;
  assertApiV2(post: MoodPost): void;
}

function readEnv(name: string): string {
  return (process.env[name] ?? '').trim();
}

function getSiteUrl(): string {
  return (readEnv('SITE_URL') || readEnv('PUBLIC_SITE_URL') || 'https://buxx.me').replace(/\/+$/, '');
}

async function fetchMoodWindow(siteUrl: string, sample: ParitySample, apiV2: boolean): Promise<MoodPost> {
  const url = new URL('/api/moods', siteUrl);
  url.searchParams.set('before', sample.before);
  url.searchParams.set('fresh', '1');
  if (apiV2) {
    url.searchParams.set('api-v2', 'true');
  }

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
    },
  });

  expect(response.ok).toBe(true);

  const payload = await response.json() as MoodApiResponse;
  const post = (payload.posts ?? []).find((candidate) => candidate.id === sample.id);

  if (!post) {
    throw new Error(`${sample.label} sample ${sample.id} missing from ${url}`);
  }

  return post as MoodPost;
}

function comparablePost(post: MoodPost): MoodPost {
  return {
    previewMediaType: post.previewMediaType ?? '',
    quote: post.quote ?? null,
    image: post.image ?? null,
    gallery: post.gallery ?? null,
    needsDetailPage: post.needsDetailPage ?? false,
    commentsCount: post.commentsCount ?? 0,
  };
}

function mediaTypes(post: MoodPost): string[] {
  return (post.media ?? []).map((item) => item.type);
}

const samples: ParitySample[] = [
  {
    kind: 'link-preview',
    before: '3600',
    id: '3572',
    label: 'bookmark card',
    assertLegacy(post) {
      expect(post.mediaHtml ?? '').toContain('bookmark-card');
    },
    assertApiV2(post) {
      expect(mediaTypes(post)).toContain('link-preview');
      expect(post.mediaHtml ?? '').toBe('');
    },
  },
  {
    kind: 'oversized-video',
    before: '3600',
    id: '3567',
    label: 'oversized video',
    assertLegacy(post) {
      expect(post.previewMediaType).toBe('too-big-video');
      expect(post.image).toBeTruthy();
      expect(post.gallery).toBeNull();
      expect(post.needsDetailPage).toBe(true);
    },
    assertApiV2(post) {
      expect(mediaTypes(post)).toContain('video');
      expect(post.needsDetailPage).toBe(true);
    },
  },
  {
    kind: 'video',
    before: '3600',
    id: '3559',
    label: 'inline video',
    assertLegacy(post) {
      expect(post.mediaHtml ?? '').toContain('<video');
    },
    assertApiV2(post) {
      expect(mediaTypes(post)).toContain('video');
      expect(post.mediaHtml ?? '').toBe('');
    },
  },
  {
    kind: 'reply',
    before: '3600',
    id: '3558',
    label: 'reply quote',
    assertLegacy(post) {
      expect(post.quote?.text ?? '').not.toBe('');
    },
    assertApiV2(post) {
      expect(post.quote?.text ?? '').not.toBe('');
    },
  },
  {
    kind: 'document',
    before: '2000',
    id: '1991',
    label: 'file attachment',
    assertLegacy(post) {
      expect(post.mediaHtml ?? '').toContain('tgme_widget_message_document_wrap');
    },
    assertApiV2(post) {
      expect(mediaTypes(post)).toContain('document');
      expect(post.mediaHtml ?? '').toBe('');
    },
  },
];

describe('mood api-v2 production parity', () => {
  test('preserves legacy rendering features for known production samples', async () => {
    const siteUrl = getSiteUrl();

    for (const sample of samples) {
      const legacyPost = await fetchMoodWindow(siteUrl, sample, false);
      const apiV2Post = await fetchMoodWindow(siteUrl, sample, true);

      sample.assertLegacy(legacyPost);
      sample.assertApiV2(apiV2Post);
      expect(comparablePost(apiV2Post)).toEqual(comparablePost(legacyPost));
    }
  }, { timeout: 30_000 });
});
