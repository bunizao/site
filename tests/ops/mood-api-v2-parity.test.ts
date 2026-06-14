import { describe, expect, test } from 'bun:test';
import type { MediaItem } from '@bunizao/contracts';
import {
  moodComponentRegistry,
  type MoodComponentKind,
} from '../fixtures/mood-component-registry';

interface MoodPost {
  id?: string;
  previewMediaType?: string;
  media?: MediaItem[];
  mediaHtml?: string;
  forwardedFrom?: {
    name?: string;
    href?: string;
    author?: string;
  } | null;
  quote?: {
    text?: string;
    author?: string;
    href?: string;
    thumbnailSrc?: string;
  } | null;
  reactions?: Array<{
    emoji?: string;
    emojiId?: string;
    emojiImage?: string;
    count?: string;
    isPaid?: boolean;
  }>;
  image?: string | null;
  gallery?: unknown;
  needsDetailPage?: boolean;
  commentsCount?: number | string;
}

interface MoodApiResponse {
  posts?: MoodPost[];
}

interface ParitySample {
  kind: MoodComponentKind;
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

const productionAssertions: Partial<Record<MoodComponentKind, Pick<ParitySample, 'label' | 'assertLegacy' | 'assertApiV2'>>> = {
  'link-preview': {
    label: 'bookmark card',
    assertLegacy(post: MoodPost) {
      expect(post.mediaHtml ?? '').toContain('bookmark-card');
    },
    assertApiV2(post: MoodPost) {
      expect(mediaTypes(post)).toContain('link-preview');
      expect(post.mediaHtml ?? '').toBe('');
    },
  },
  'oversized-video': {
    label: 'oversized video',
    assertLegacy(post: MoodPost) {
      expect(post.previewMediaType).toBe('too-big-video');
      expect(post.image).toBeTruthy();
      expect(post.gallery).toBeNull();
      expect(post.needsDetailPage).toBe(true);
    },
    assertApiV2(post: MoodPost) {
      expect(mediaTypes(post)).toContain('video');
      expect(post.needsDetailPage).toBe(true);
    },
  },
  video: {
    label: 'inline video',
    assertLegacy(post: MoodPost) {
      expect(post.mediaHtml ?? '').toContain('<video');
    },
    assertApiV2(post: MoodPost) {
      expect(mediaTypes(post)).toContain('video');
      expect(post.mediaHtml ?? '').toBe('');
    },
  },
  quote: {
    label: 'reply quote',
    assertLegacy(post: MoodPost) {
      expect(post.quote?.text ?? '').not.toBe('');
    },
    assertApiV2(post: MoodPost) {
      expect(post.quote?.text ?? '').not.toBe('');
    },
  },
  forwarded: {
    label: 'forwarded source',
    assertLegacy(post: MoodPost) {
      expect(post.forwardedFrom?.name ?? '').not.toBe('');
    },
    assertApiV2(post: MoodPost) {
      expect(post.forwardedFrom?.name ?? '').not.toBe('');
    },
  },
  reactions: {
    label: 'reactions',
    assertLegacy(post: MoodPost) {
      expect(post.reactions?.length ?? 0).toBeGreaterThan(0);
    },
    assertApiV2(post: MoodPost) {
      expect(post.reactions?.length ?? 0).toBeGreaterThan(0);
    },
  },
  comments: {
    label: 'comment count',
    assertLegacy(post: MoodPost) {
      expect(Number(post.commentsCount ?? 0)).toBeGreaterThan(0);
    },
    assertApiV2(post: MoodPost) {
      expect(Number(post.commentsCount ?? 0)).toBeGreaterThan(0);
    },
  },
  document: {
    label: 'file attachment',
    assertLegacy(post: MoodPost) {
      expect(post.mediaHtml ?? '').toContain('tgme_widget_message_document_wrap');
    },
    assertApiV2(post: MoodPost) {
      expect(mediaTypes(post)).toContain('document');
      expect(post.mediaHtml ?? '').toBe('');
    },
  },
};

function verifiedProductionSamples(): ParitySample[] {
  return moodComponentRegistry.flatMap((entry) => {
    if (!entry.prodId || !entry.prodWindowBefore) return [];

    const assertion = productionAssertions[entry.kind];
    if (!assertion) return [];

    return [{
      kind: entry.kind,
      before: entry.prodWindowBefore,
      id: entry.prodId,
      ...assertion,
    }];
  });
}

const samples = verifiedProductionSamples();

const expectedProductionKinds: MoodComponentKind[] = [
  'video',
  'oversized-video',
  'forwarded',
  'quote',
  'reactions',
  'comments',
  'link-preview',
  'document',
];

describe('mood api-v2 production parity registry', () => {
  test('uses verified production samples from the component registry', () => {
    expect(samples.map((sample) => sample.kind)).toEqual(expectedProductionKinds);
  });
});

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
