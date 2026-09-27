import { describe, expect, test } from 'bun:test';
import {
  MoodArchiveHttpError,
  loadMoodArchiveWithFallback,
  loadMoodDocument,
  loadMoodFeed,
  resolveMoodReadSource,
} from '../../src/features/mood/server/api-client';
import type {
  MoodContentDocument,
  MoodFeedResponse,
} from '@bunizao/contracts';

function createContext(locals: Record<string, unknown> = {}) {
  return {
    request: new Request('https://buxx.me/mood'),
    locals,
  };
}

describe('mood API client', () => {
  test('the read source is the explicit option, else MOOD_READ_SOURCE, else live', () => {
    // bun exposes .env files through process.env, which outranks locals.
    const previous = process.env.MOOD_READ_SOURCE;
    delete process.env.MOOD_READ_SOURCE;
    try {
      const archiveLocals = { env: { MOOD_READ_SOURCE: 'archive' } };
      expect(resolveMoodReadSource(archiveLocals, 'live')).toBe('live');
      expect(resolveMoodReadSource(archiveLocals)).toBe('archive');
      expect(resolveMoodReadSource({ env: {} })).toBe('live');
    } finally {
      if (previous === undefined) delete process.env.MOOD_READ_SOURCE;
      else process.env.MOOD_READ_SOURCE = previous;
    }
  });

  test('routes explicit archive mood reads through the private API binding', async () => {
    const paths: string[] = [];
    const feed: MoodFeedResponse = {
      posts: [{
        id: '990001',
        datetime: '2026-06-14T00:00:00.000Z',
        tag: 'test',
        previewText: 'Structured mood',
        previewHtml: 'Structured mood',
        previewMediaType: 'video',
        media: [{
          type: 'video',
          src: 'https://image.example.test/mood/990001/video.mp4',
          posterSrc: 'https://image.example.test/mood/990001/poster.jpg',
        }],
        gallery: null,
        image: null,
        imageFallback: null,
        imageWidth: null,
        imageHeight: null,
        imageLayout: null,
        imageKind: null,
        mediaHtml: '',
        needsDetailPage: true,
        forwardedFrom: null,
        quote: null,
        reactions: [],
        commentsCount: 2,
      }],
      channel: { slug: 'mood', title: 'Mood' },
    };
    const document: MoodContentDocument = {
      id: '990001',
      source: 'mood',
      datetime: '2026-06-14T00:00:00.000Z',
      bodyHtml: 'Structured mood',
      previewText: 'Structured mood',
      previewHtml: 'Structured mood',
      hero: feed.posts[0].media[0],
      media: feed.posts[0].media,
      forwardedFrom: null,
      quote: null,
      reactions: [],
      commentsCount: 2,
      channel: feed.channel,
    };
    const api = {
      async fetch(input: RequestInfo | URL) {
        const request = input instanceof Request ? input : new Request(input);
        const url = new URL(request.url);
        paths.push(`${url.pathname}${url.search}`);

        if (url.pathname === '/v2/mood') {
          return Response.json(feed);
        }

        if (url.pathname === '/v2/mood/990001') {
          return Response.json(document);
        }

        return Response.json({ error: 'unexpected path' }, { status: 404 });
      },
    };
    const context = createContext({ env: { API: api } });

    const feedResult = await loadMoodFeed(context, {
      limit: 1,
      source: 'archive',
      fresh: true,
      fallback: false,
    });
    const documentResult = await loadMoodDocument(context, '990001', { source: 'archive' });

    expect(feedResult.posts[0]?.media[0]?.type).toBe('video');
    expect(documentResult?.id).toBe('990001');
    expect(paths).toEqual([
      '/v2/mood?fresh=true&limit=1&fallback=0',
      '/v2/mood/990001?fallback=0',
    ]);
  });

  test('tag queries force the archive route with the tag param and no fallback', async () => {
    const paths: string[] = [];
    const api = {
      async fetch(input: RequestInfo | URL) {
        const request = input instanceof Request ? input : new Request(input);
        const url = new URL(request.url);
        paths.push(`${url.pathname}${url.search}`);
        return Response.json({ posts: [], channel: { slug: 'mood', title: 'Mood' } });
      },
    };
    const context = createContext({ env: { API: api } });

    // No explicit source: the tag alone must force the archive branch even if
    // the resolved read source would be live.
    await loadMoodFeed(context, { tag: 'life', source: 'live' });
    await loadMoodFeed(context, { tag: 'life', before: '990001' });

    expect(paths).toEqual([
      '/v2/mood?tag=life&fallback=0',
      '/v2/mood?before=990001&tag=life&fallback=0',
    ]);
  });

  test('degrades unfiltered archive reads to the live reader when the archive fails', async () => {
    const originalFetch = globalThis.fetch;
    const originalWarn = console.warn;
    const liveUrls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      liveUrls.push(String(input instanceof Request ? input.url : input));
      return new Response('live unavailable too', { status: 503 });
    }) as unknown as typeof fetch;
    console.warn = () => {};
    const context = createContext({
      env: {
        API: {
          async fetch() {
            return new Response('archive unavailable', { status: 500 });
          },
        },
        CHANNEL: 'tutumood',
      },
    });

    try {
      await loadMoodFeed(context, { limit: 20, source: 'archive' }).catch(() => null);
      await loadMoodDocument(context, '3794', { source: 'archive' }).catch(() => null);
    } finally {
      globalThis.fetch = originalFetch;
      console.warn = originalWarn;
    }

    // Both the feed and the detail path must reach the Telegram mirror after
    // the archive call fails; the archive error itself must not surface.
    expect(liveUrls.length).toBeGreaterThanOrEqual(2);
    expect(liveUrls.every((url) => !url.includes('/v2/mood'))).toBe(true);
  });

  test('does not re-scrape Telegram after site-api reports its own fallbacks exhausted', async () => {
    const originalFetch = globalThis.fetch;
    let liveFetchCalls = 0;
    globalThis.fetch = (async () => {
      liveFetchCalls += 1;
      return new Response('unexpected live read', { status: 503 });
    }) as unknown as typeof fetch;
    const context = createContext({
      env: {
        API: {
          async fetch(request: Request) {
            const code = new URL(request.url).pathname === '/v2/mood' ? 'mood_feed_failed' : 'mood_detail_failed';
            return Response.json({ error: { code, message: 'unavailable' } }, { status: 500 });
          },
        },
        CHANNEL: 'tutumood',
      },
    });
    const errors: unknown[] = [];

    try {
      await loadMoodFeed(context, { limit: 20, source: 'archive' }).catch((error) => errors.push(error));
      await loadMoodDocument(context, '3794', { source: 'archive' }).catch((error) => errors.push(error));
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(liveFetchCalls).toBe(0);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toBeInstanceOf(MoodArchiveHttpError);
    expect(errors[0]).toMatchObject({ status: 500, code: 'mood_feed_failed' });
    expect(errors[1]).toMatchObject({ status: 500, code: 'mood_detail_failed' });
  });

  test('still falls back to the live reader on an archive 404 (ingest lag)', async () => {
    const warnings: unknown[][] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(args);

    try {
      expect(await loadMoodArchiveWithFallback(
        'detail',
        async () => {
          throw new MoodArchiveHttpError(404, 'Not Found', 'mood_not_found');
        },
        async () => 'live result',
      )).toBe('live result');
      expect(await loadMoodArchiveWithFallback(
        'detail',
        async () => {
          throw new MoodArchiveHttpError(503, 'Service Unavailable', 'mood_repository_unavailable');
        },
        async () => 'live result',
      )).toBe('live result');
    } finally {
      console.warn = originalWarn;
    }

    expect(warnings).toHaveLength(2);
  });

  test('keeps tag-filtered archive reads strict when the archive fails', async () => {
    const originalFetch = globalThis.fetch;
    let liveFetchCalls = 0;
    globalThis.fetch = (async () => {
      liveFetchCalls += 1;
      return new Response('unexpected live read', { status: 503 });
    }) as unknown as typeof fetch;
    const context = createContext({
      env: {
        API: {
          async fetch() {
            return new Response('archive unavailable', { status: 500 });
          },
        },
        CHANNEL: 'tutumood',
      },
    });
    let error: unknown;

    try {
      await loadMoodFeed(context, { limit: 20, source: 'archive', tag: 'life' });
    } catch (caught) {
      error = caught;
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('Mood archive request failed: 500');
    expect(liveFetchCalls).toBe(0);
  });

  test('keeps E2E fixture mode independent from the service binding', async () => {
    const context = createContext({ env: { E2E_SITE_FIXTURE: '1' } });

    const feed = await loadMoodFeed(context, { limit: 1, source: 'archive' });
    const document = await loadMoodDocument(context, feed.posts[0]?.id ?? '990001', { source: 'archive' });

    expect(feed.posts.length).toBeGreaterThan(0);
    expect(document?.id).toBe(feed.posts[0]?.id);
  });
});
