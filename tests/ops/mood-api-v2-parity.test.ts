import { describe, expect, test } from 'bun:test';
import type { MediaItem } from '@bunizao/contracts';

// Live production smoke. The mood read paths (`?api-v2=false` legacy and
// `?api-v2=true`) both resolve to the structured `site-api` reader now, so this
// test asserts the two paths stay identical and that production actually serves
// structured content. Per-kind rendering correctness is covered offline and
// drift-proof in `tests/unit/mood-component-registry.test.ts`; pinning exact
// production message ids here only rots as posts are edited or deleted.

interface MoodPost {
  id?: string;
  previewMediaType?: string;
  media?: MediaItem[];
  mediaHtml?: string;
  forwardedFrom?: { name?: string; href?: string; author?: string } | null;
  quote?: { text?: string; author?: string; href?: string; thumbnailSrc?: string } | null;
  reactions?: Array<{ emoji?: string; count?: string }>;
  image?: string | null;
  gallery?: unknown;
  needsDetailPage?: boolean;
  commentsCount?: number | string;
}

interface MoodApiResponse {
  posts?: MoodPost[];
}

// Windows covering both historical id ranges that carry the richer component mix.
const PRODUCTION_WINDOWS = ['3600', '2000'];

function readEnv(name: string): string {
  return (process.env[name] ?? '').trim();
}

function getSiteUrl(): string {
  return (readEnv('SITE_URL') || readEnv('PUBLIC_SITE_URL') || 'https://buxx.me').replace(/\/+$/, '');
}

async function fetchWindow(siteUrl: string, before: string, apiV2: boolean): Promise<MoodPost[]> {
  const url = new URL('/api/moods', siteUrl);
  url.searchParams.set('before', before);
  url.searchParams.set('fresh', '1');
  if (apiV2) {
    url.searchParams.set('api-v2', 'true');
  }

  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
  });
  expect(response.ok, `GET ${url} -> ${response.status}`).toBe(true);

  const payload = await response.json() as MoodApiResponse;
  return payload.posts ?? [];
}

// The fields that must be byte-identical across both read paths. Includes the
// structured media types so any divergence in non-image media is caught.
function comparablePost(post: MoodPost) {
  return {
    previewMediaType: post.previewMediaType ?? '',
    mediaTypes: (post.media ?? []).map((item) => item.type),
    quote: post.quote ?? null,
    image: post.image ?? null,
    gallery: post.gallery ?? null,
    forwardedFrom: post.forwardedFrom ?? null,
    reactions: (post.reactions ?? []).map((reaction) => ({
      emoji: reaction.emoji ?? '',
      count: String(reaction.count ?? ''),
    })),
    needsDetailPage: post.needsDetailPage ?? false,
    commentsCount: Number(post.commentsCount ?? 0),
  };
}

describe('mood production read-path parity', () => {
  test('legacy and api-v2 return identical structured posts', async () => {
    const siteUrl = getSiteUrl();
    let compared = 0;
    let withMedia = 0;

    for (const before of PRODUCTION_WINDOWS) {
      const [legacy, apiV2] = await Promise.all([
        fetchWindow(siteUrl, before, false),
        fetchWindow(siteUrl, before, true),
      ]);

      expect(legacy.length, `legacy window before=${before} is empty`).toBeGreaterThan(0);

      const apiV2ById = new Map(apiV2.map((post) => [post.id, post]));
      expect(
        new Set(apiV2ById.keys()),
        `window before=${before} returns a different post set across read paths`,
      ).toEqual(new Set(legacy.map((post) => post.id)));

      for (const legacyPost of legacy) {
        const apiV2Post = apiV2ById.get(legacyPost.id);
        expect(apiV2Post, `post ${legacyPost.id} missing from api-v2`).toBeDefined();
        expect(comparablePost(apiV2Post!)).toEqual(comparablePost(legacyPost));

        compared += 1;
        if ((legacyPost.media?.length ?? 0) > 0) {
          withMedia += 1;
        }
      }
    }

    // Guard against both paths silently degrading to empty payloads.
    expect(compared, 'no production posts were compared').toBeGreaterThan(0);
    expect(withMedia, 'production feed served no structured media').toBeGreaterThan(0);
  }, { timeout: 30_000 });
});
