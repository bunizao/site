import { describe, expect, test } from 'bun:test';
import {
  loadMoodComments,
  loadMoodDocument,
  loadMoodFeed,
  loadMoodProbe,
  loadMoodStatsSnapshot,
} from '../../src/features/mood/server/api-client';
import type {
  MoodCommentsPage,
  MoodContentDocument,
  MoodFeedResponse,
  MoodProbeResult,
  MoodStatsSnapshot,
} from '@bunizao/contracts';

function createContext(locals: Record<string, unknown> = {}) {
  return {
    request: new Request('https://buxx.me/mood'),
    locals,
  };
}

describe('mood API client', () => {
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
    const comments: MoodCommentsPage = {
      comments: [{
        id: '990000',
        author: 'Tester',
        datetime: '2026-06-14T00:01:00.000Z',
        content: 'Comment',
        reactions: [],
      }],
      hasMore: false,
      nextBefore: '',
    };
    const probe: MoodProbeResult = { latestId: '990001' };
    const stats: MoodStatsSnapshot = {
      activity: [{ date: '2026-06-18', count: 1 }],
      rhythm: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0)),
      sentimentTimeline: [],
      streaks: { current: 1, longest: 1 },
      media: { text: 1, photo: 0, video: 0, other: 0 },
      totals: { posts: 1, firstPostAt: '2026-06-18T00:00:00.000Z', lastPostAt: '2026-06-18T00:00:00.000Z' },
      generatedAt: '2026-06-18T10:00:00.000Z',
    };
    const api = {
      async fetch(input: RequestInfo | URL) {
        const request = input instanceof Request ? input : new Request(input);
        const url = new URL(request.url);
        paths.push(`${url.pathname}${url.search}`);

        if (url.pathname === '/v2/mood' && url.searchParams.get('probe') === 'true') {
          return Response.json(probe);
        }

        if (url.pathname === '/v2/mood/stats') {
          return Response.json(stats);
        }

        if (url.pathname === '/v2/mood') {
          return Response.json(feed);
        }

        if (url.pathname === '/v2/mood/990001') {
          return Response.json(document);
        }

        if (url.pathname === '/v2/mood/990001/comments') {
          return Response.json(comments);
        }

        return Response.json({ error: 'unexpected path' }, { status: 404 });
      },
    };
    const context = createContext({ env: { API: api } });

    const feedResult = await loadMoodFeed(context, { limit: 1, tag: 'travel', source: 'archive' });
    const documentResult = await loadMoodDocument(context, '990001', { source: 'archive' });
    const commentsResult = await loadMoodComments(context, '990001', { before: '990000', source: 'archive' });
    const probeResult = await loadMoodProbe(context, { source: 'archive' });
    const statsResult = await loadMoodStatsSnapshot(context);

    expect(feedResult.posts[0]?.media[0]?.type).toBe('video');
    expect(documentResult?.id).toBe('990001');
    expect(commentsResult.comments[0]?.id).toBe('990000');
    expect(probeResult.latestId).toBe('990001');
    expect(statsResult?.totals.posts).toBe(1);
    expect(paths).toEqual([
      '/v2/mood?limit=1&tag=travel',
      '/v2/mood/990001',
      '/v2/mood/990001/comments?before=990000',
      '/v2/mood?probe=true&fresh=true',
      '/v2/mood/stats',
    ]);
  });

  test('returns null when the stats snapshot is unavailable', async () => {
    const api = {
      async fetch() {
        return Response.json({ error: { code: 'mood_stats_unavailable' } }, { status: 503 });
      },
    };

    const result = await loadMoodStatsSnapshot(createContext({ env: { API: api } }));
    expect(result).toBeNull();
  });

  test('keeps E2E fixture mode independent from the service binding', async () => {
    const context = createContext({ env: { E2E_SITE_FIXTURE: '1' } });

    const feed = await loadMoodFeed(context, { limit: 1, source: 'archive' });
    const document = await loadMoodDocument(context, feed.posts[0]?.id ?? '990001', { source: 'archive' });
    const comments = await loadMoodComments(context, feed.posts[0]?.id ?? '990001', { source: 'archive' });
    const probe = await loadMoodProbe(context, { source: 'archive' });

    expect(feed.posts.length).toBeGreaterThan(0);
    expect(document?.id).toBe(feed.posts[0]?.id);
    expect(Array.isArray(comments.comments)).toBe(true);
    expect(probe.latestId).toBeTruthy();
  });
});
