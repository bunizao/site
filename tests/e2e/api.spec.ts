import { expect, test } from '@playwright/test';
import { getLatestMoodId } from './helpers';

interface MoodApiPost {
  id: string;
  datetime: string;
  previewText: string;
}

interface MoodApiPayload {
  posts: MoodApiPost[];
  channel?: Record<string, unknown>;
}

function requireBaseUrl(value: string | undefined): string {
  if (!value) {
    throw new Error('Playwright baseURL is required for this test suite.');
  }

  return value;
}

test.describe('API behavior', () => {
  test('GET /api/moods returns payload with expected shape', async ({ request }) => {
    const response = await request.get('/api/moods');
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['content-type']).toContain('application/json');

    const payload = (await response.json()) as MoodApiPayload;
    expect(Array.isArray(payload.posts)).toBe(true);

    if (payload.posts.length > 0) {
      const first = payload.posts[0];
      expect(typeof first.id).toBe('string');
      expect(typeof first.datetime).toBe('string');
      expect(typeof first.previewText).toBe('string');
    }

    if (payload.channel) {
      expect(typeof payload.channel).toBe('object');
    }
  });

  test('GET /api/moods validates cursor parameters and probe mode', async ({ request }) => {
    const badCursor = await request.get('/api/moods?before=abc');
    expect(badCursor.status()).toBe(400);

    const badPayload = (await badCursor.json()) as { error?: string };
    expect(badPayload.error).toContain('Invalid cursor');

    const probe = await request.get('/api/moods?probe=1&fresh=1');
    expect(probe.ok()).toBeTruthy();

    const probePayload = (await probe.json()) as { latestId?: unknown };
    expect(typeof probePayload.latestId).toBe('string');
  });

  test('GET /api/comments validates params and returns comment payload', async ({ request }) => {
    const missing = await request.get('/api/comments');
    expect(missing.status()).toBe(400);

    const invalid = await request.get('/api/comments?postId=abc');
    expect(invalid.status()).toBe(400);

    const latestMoodId = (await getLatestMoodId(request)) || '1';
    const response = await request.get(`/api/comments?postId=${latestMoodId}`);
    expect(response.ok()).toBeTruthy();

    const payload = (await response.json()) as {
      comments?: unknown[];
      hasMore?: unknown;
      nextBefore?: unknown;
    };

    expect(Array.isArray(payload.comments)).toBe(true);
    expect(typeof payload.hasMore).toBe('boolean');
    expect(typeof payload.nextBefore).toBe('string');
  });

  test('GET /api/oembed.json validates input and returns embed payload', async ({ request }, testInfo) => {
    const baseURL = requireBaseUrl(testInfo.project.use.baseURL as string | undefined);

    const missingUrl = await request.get('/api/oembed.json');
    expect(missingUrl.status()).toBe(400);

    const invalidFormat = await request.get('/api/oembed.json?url=not-a-url');
    expect(invalidFormat.status()).toBe(400);

    const wrongHost = await request.get('/api/oembed.json?url=https://example.com/mood');
    expect(wrongHost.status()).toBe(403);

    const unsupportedPath = await request.get(`/api/oembed.json?url=${encodeURIComponent(`${baseURL}/`)}`);
    expect(unsupportedPath.status()).toBe(404);

    const moodList = await request.get(`/api/oembed.json?url=${encodeURIComponent(`${baseURL}/mood`)}`);
    expect(moodList.ok()).toBeTruthy();

    const listPayload = (await moodList.json()) as {
      type?: string;
      html?: string;
      width?: number;
      height?: number;
    };

    expect(listPayload.type).toBe('rich');
    expect(typeof listPayload.width).toBe('number');
    expect(typeof listPayload.height).toBe('number');
    expect(listPayload.html).toContain('<iframe');
    expect(listPayload.html).toContain('/mood/embed?');

    const moodDetail = await request.get(`/api/oembed.json?url=${encodeURIComponent(`${baseURL}/mood/1`)}`);
    expect(moodDetail.ok()).toBeTruthy();

    const detailPayload = (await moodDetail.json()) as { html?: string };
    expect(detailPayload.html).toContain('id=1');

    const optionsResponse = await request.fetch('/api/oembed.json', { method: 'OPTIONS' });
    expect(optionsResponse.status()).toBe(204);
  });

  test('RSS and SVG endpoints return expected content types', async ({ request }) => {
    const rss = await request.get('/mood/rss.xml');
    expect(rss.ok()).toBeTruthy();
    expect(rss.headers()['content-type']).toContain('application/rss+xml');
    expect(await rss.text()).toContain('<rss');

    const statusSvg = await request.get('/api/status.svg?theme=light');
    expect(statusSvg.ok()).toBeTruthy();
    expect(statusSvg.headers()['content-type']).toContain('image/svg+xml');
    expect(await statusSvg.text()).toContain('<svg');

    const techSvg = await request.get('/api/tech-stack.svg?theme=dark');
    expect(techSvg.ok()).toBeTruthy();
    expect(techSvg.headers()['content-type']).toContain('image/svg+xml');
    expect(await techSvg.text()).toContain('<svg');

    const badgeSvg = await request.get('/api/site-badge.svg?theme=dark&style=gradient');
    expect(badgeSvg.ok()).toBeTruthy();
    expect(badgeSvg.headers()['content-type']).toContain('image/svg+xml');
    expect(await badgeSvg.text()).toContain('<svg');

    const projectDefault = await request.get('/api/project.svg');
    expect(projectDefault.ok()).toBeTruthy();
    expect(projectDefault.headers()['content-type']).toContain('image/svg+xml');

    const projectNotFound = await request.get('/api/project.svg?project=does-not-exist');
    expect(projectNotFound.status()).toBe(404);
  });

  test('notify, webhook, and static proxy endpoints handle unauthorized/invalid requests', async ({ request }) => {
    const webhookGet = await request.get('/api/telegram-webhook');
    expect(webhookGet.status()).toBe(405);

    const webhookPost = await request.post('/api/telegram-webhook', {
      data: {},
    });
    expect(webhookPost.status()).toBe(401);

    const subscribeGet = await request.get('/api/notify/subscribe');
    expect(subscribeGet.status()).toBe(405);

    const subscribeInvalidJson = await request.post('/api/notify/subscribe', {
      headers: {
        'content-type': 'application/json',
      },
      data: 'not-json',
    });
    expect(subscribeInvalidJson.status()).toBe(400);

    const confirmNoToken = await request.get('/api/notify/confirm');
    expect(confirmNoToken.status()).toBe(200);
    expect(await confirmNoToken.text()).toContain('Invalid link');

    const unsubscribeNoToken = await request.get('/api/notify/unsubscribe');
    expect(unsubscribeNoToken.status()).toBe(200);
    expect(await unsubscribeNoToken.text()).toContain('Invalid link');

    const dispatchUnauthorized = await request.post('/api/notify/dispatch', { data: {} });
    expect(dispatchUnauthorized.status()).toBe(401);

    const scheduleUnauthorized = await request.get('/api/notify/schedule');
    expect(scheduleUnauthorized.status()).toBe(401);

    const retryUnauthorized = await request.get('/api/notify/retry');
    expect(retryUnauthorized.status()).toBe(401);

    const staticInvalidTarget = await request.get('/static/not-a-url');
    expect(staticInvalidTarget.status()).toBe(400);

    const staticForbiddenHost = await request.get('/static/https://example.com/test.png');
    expect(staticForbiddenHost.status()).toBe(400);
  });
});
