import { expect, test } from './fixtures';
import type {
  MoodCommentsPage,
  MoodFeedResponse,
  MoodProbeResult,
} from '../../src/features/mood/server/contracts';
import { getLatestMoodId } from './helpers';

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

    const payload = (await response.json()) as MoodFeedResponse;
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

    const probePayload = (await probe.json()) as MoodProbeResult;
    expect(typeof probePayload.latestId).toBe('string');
  });

  test('GET /api/health returns lightweight monitor-safe health', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['content-type']).toContain('application/json');

    const payload = (await response.json()) as {
      status?: string;
      mode?: string;
      checkedAt?: string;
      diagnostic?: string;
      checks?: Array<{
        id?: string;
        label?: string;
        status?: string;
        critical?: boolean;
        durationMs?: number;
      }>;
    };

    expect(payload.status).toBe('ok');
    expect(payload.mode).toBe('ping');
    expect(typeof payload.checkedAt).toBe('string');
    expect(payload.diagnostic).toBe('/api/health?diagnostic=1');
    expect(payload.checks).toBeUndefined();
  });

  test('GET /api/health supports diagnostic deep checks', async ({ request }) => {
    const response = await request.get('/api/health?diagnostic=1&deep=1');
    expect(response.ok()).toBeTruthy();

    const payload = (await response.json()) as {
      mode?: string;
      checks?: Array<{ id?: string; status?: string }>;
    };

    expect(payload.mode).toBe('deep');
    const checks = payload.checks ?? [];
    expect(checks.some((check) => check.id === 'mood-image-worker')).toBe(true);
    expect(checks.some((check) => check.id === 'telegram-webhook')).toBe(true);
  });

  test('GET /api/comments validates params and returns comment payload', async ({ request }) => {
    const missing = await request.get('/api/comments');
    expect(missing.status()).toBe(400);

    const invalid = await request.get('/api/comments?postId=abc');
    expect(invalid.status()).toBe(400);

    const latestMoodId = (await getLatestMoodId(request)) || '1';
    const response = await request.get(`/api/comments?postId=${latestMoodId}`);
    expect(response.ok()).toBeTruthy();

    const payload = (await response.json()) as MoodCommentsPage;

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

    const agentMood = await request.get('/agent/mood');
    expect(agentMood.ok()).toBeTruthy();
    expect(agentMood.headers()['content-type']).toContain('text/markdown');
    expect(await agentMood.text()).toContain('# Mood Feed');

    const agentMoodPost = await request.get('/agent/mood/990001');
    expect(agentMoodPost.ok()).toBeTruthy();
    expect(agentMoodPost.headers()['content-type']).toContain('text/markdown');
    expect(await agentMoodPost.text()).toContain('# 990001');

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

  test('GET /api/notify/preview returns deterministic preview payload in e2e mode', async ({ request }) => {
    const preview = await request.get('/api/notify/preview?mode=daily&timezone=Asia/Kuala_Lumpur');
    expect(preview.ok()).toBeTruthy();

    const payload = (await preview.json()) as {
      mode?: string;
      timezone?: string;
      source?: { channelTitle?: string; latestPostId?: string | null };
      subjects?: Record<string, string>;
      html?: Record<string, string>;
    };

    expect(payload.mode).toBe('daily');
    expect(payload.timezone).toBe('Asia/Kuala_Lumpur');
    expect(payload.source?.channelTitle).toBe('E2E Channel');
    expect(payload.source?.latestPostId).toBeTruthy();
    expect(payload.subjects?.subscribe).toContain('Confirm');
    expect(payload.subjects?.welcome).toContain('Welcome');
    expect(payload.subjects?.cancel).toContain('paused');
    expect(payload.html?.mood).toContain('/mood/');
    expect(payload.html?.digest).toContain('E2E Channel');
    expect(payload.html?.welcome).toContain('/api/notify/unsubscribe?token=');
    expect(payload.html?.cancel).toContain('/mood?subscribe=1');
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
    expect(await confirmNoToken.text()).toContain('missing a token');

    const unsubscribeNoToken = await request.get('/api/notify/unsubscribe');
    expect(unsubscribeNoToken.status()).toBe(200);
    expect(await unsubscribeNoToken.text()).toContain('missing a token');

    const unsubscribePostNoToken = await request.post('/api/notify/unsubscribe');
    expect(unsubscribePostNoToken.status()).toBe(200);
    expect(await unsubscribePostNoToken.text()).toContain('missing a token');

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

  test('static proxy returns the e2e fixture asset for allowed Telegram hosts', async ({ request }) => {
    const response = await request.get('/static/https://cdn4.telegram-cdn.org/e2e-image.png');
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['content-type']).toContain('image/png');
    expect(response.headers()['access-control-allow-origin']).toBe('*');
    expect(await response.text()).toBe('e2e-image');
  });
});
