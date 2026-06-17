import { describe, expect, test } from 'bun:test';
import type {
  MoodCommentsPage,
  MoodContentDocument,
  MoodFeedResponse,
  MoodProbeResult,
} from '@bunizao/contracts';
import { GET as getCompatibilityComments } from '../../src/pages/api/comments';
import { GET as getCompatibilityMoods } from '../../src/pages/api/moods';
import { GET as getV1Mood } from '../../src/pages/api/v1/mood/index';
import { GET as getV1MoodComments } from '../../src/pages/api/v1/mood/[id]/comments';
import { GET as getV1MoodDetail } from '../../src/pages/api/v1/mood/[id]';
import { GET as getV2Mood } from '../../src/pages/api/v2/mood/index';
import { GET as getV2MoodComments } from '../../src/pages/api/v2/mood/[id]/comments';
import { GET as getV2MoodDetail } from '../../src/pages/api/v2/mood/[id]';

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

let requestIndex = 0;

function createRouteContext(
  url: string,
  locals: Record<string, unknown> = {},
  params: Record<string, string> = {}
) {
  requestIndex += 1;
  return {
    request: new Request(url, {
      headers: {
        'x-real-ip': `203.0.113.${requestIndex}`,
      },
    }),
    locals,
    params,
  } as any;
}

function createArchiveApi(paths: string[]) {
  return {
    async fetch(input: RequestInfo | URL) {
      const request = input instanceof Request ? input : new Request(input);
      const url = new URL(request.url);
      paths.push(`${url.pathname}${url.search}`);

      if (url.pathname === '/v2/mood' && url.searchParams.get('probe') === 'true') {
        return Response.json(probe);
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
}

async function readJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

describe('mood API routes', () => {
  test('forces archive reads on /api/v2/mood routes', async () => {
    const paths: string[] = [];
    const locals = { env: { API: createArchiveApi(paths) } };

    const feedResponse = await getV2Mood(createRouteContext(
      'https://buxx.me/api/v2/mood?before=44&fresh=1',
      locals
    ));
    const detailResponse = await getV2MoodDetail(createRouteContext(
      'https://buxx.me/api/v2/mood/990001',
      locals,
      { id: '990001' }
    ));
    const commentsResponse = await getV2MoodComments(createRouteContext(
      'https://buxx.me/api/v2/mood/990001/comments?before=990000',
      locals,
      { id: '990001' }
    ));

    expect(feedResponse.status).toBe(200);
    expect(detailResponse.status).toBe(200);
    expect(commentsResponse.status).toBe(200);
    expect((await readJson<MoodFeedResponse>(feedResponse)).posts[0]?.id).toBe('990001');
    expect((await readJson<MoodContentDocument>(detailResponse)).id).toBe('990001');
    expect((await readJson<MoodCommentsPage>(commentsResponse)).comments[0]?.id).toBe('990000');
    expect(paths).toEqual([
      '/v2/mood?before=44&fresh=true',
      '/v2/mood/990001',
      '/v2/mood/990001/comments?before=990000',
    ]);
  });

  test('keeps compatibility endpoints pinned to live when api-v2 is supplied', async () => {
    const paths: string[] = [];
    const locals = { env: { API: createArchiveApi(paths), E2E_SITE_FIXTURE: '1' } };

    const probeResponse = await getCompatibilityMoods(createRouteContext(
      'https://buxx.me/api/moods?api-v2=true&probe=1',
      locals
    ));
    const commentsResponse = await getCompatibilityComments(createRouteContext(
      'https://buxx.me/api/comments?api-v2=true&postId=990001&before=990000',
      locals
    ));

    expect(probeResponse.status).toBe(200);
    expect(commentsResponse.status).toBe(200);
    expect((await readJson<MoodProbeResult>(probeResponse)).latestId).toBeTruthy();
    expect(Array.isArray((await readJson<MoodCommentsPage>(commentsResponse)).comments)).toBe(true);
    expect(paths).toEqual([]);
  });

  test('serves /api/v1/mood routes from the live fixture source without a service binding', async () => {
    const locals = { env: { E2E_SITE_FIXTURE: '1' } };

    const feedResponse = await getV1Mood(createRouteContext('https://buxx.me/api/v1/mood', locals));
    const feedBody = await readJson<MoodFeedResponse>(feedResponse);
    const id = feedBody.posts[0]?.id ?? '990001';
    const detailResponse = await getV1MoodDetail(createRouteContext(
      `https://buxx.me/api/v1/mood/${id}`,
      locals,
      { id }
    ));
    const commentsResponse = await getV1MoodComments(createRouteContext(
      `https://buxx.me/api/v1/mood/${id}/comments`,
      locals,
      { id }
    ));

    expect(feedResponse.status).toBe(200);
    expect(detailResponse.status).toBe(200);
    expect(commentsResponse.status).toBe(200);
    expect(feedBody.posts.length).toBeGreaterThan(0);
    expect((await readJson<MoodContentDocument>(detailResponse)).id).toBe(id);
    expect(Array.isArray((await readJson<MoodCommentsPage>(commentsResponse)).comments)).toBe(true);
  });

  test('preserves cursor validation on compatibility and source routes', async () => {
    const paths: string[] = [];
    const locals = { env: { API: createArchiveApi(paths) } };

    const badFeedCursor = await getV2Mood(createRouteContext(
      'https://buxx.me/api/v2/mood?before=abc',
      locals
    ));
    const badPostId = await getV2MoodDetail(createRouteContext(
      'https://buxx.me/api/v2/mood/abc',
      locals,
      { id: 'abc' }
    ));
    const missingCompatibilityPostId = await getCompatibilityComments(createRouteContext(
      'https://buxx.me/api/comments?api-v2=true',
      locals
    ));

    expect(badFeedCursor.status).toBe(400);
    expect(badPostId.status).toBe(400);
    expect(missingCompatibilityPostId.status).toBe(400);
    expect(paths).toEqual([]);
  });
});
