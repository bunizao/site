import { expect, test } from './fixtures';

// Every /api/* route is answered by site-api; locally it is an e2e fixture.
// These tests cover only routes the public Worker renders itself.
test.describe('API behavior', () => {
  test('serves the mood RSS feed and Markdown to agents on the canonical URLs', async ({ request }) => {
    const rss = await request.get('/mood/rss.xml');
    expect(rss.ok()).toBeTruthy();
    expect(rss.headers()['content-type']).toContain('application/rss+xml');
    expect(await rss.text()).toContain('<rss');

    const agentMood = await request.get('/mood', {
      headers: { Accept: 'text/markdown' },
    });
    expect(agentMood.ok()).toBeTruthy();
    expect(agentMood.headers()['content-type']).toContain('text/markdown');
    expect(agentMood.headers()['x-markdown-tokens']).toBeTruthy();
    expect(agentMood.headers().vary ?? '').toContain('Accept');
    expect(await agentMood.text()).toContain('# Mood Feed');

    const agentMoodPost = await request.get('/mood/990001', {
      headers: { Accept: 'text/markdown' },
    });
    expect(agentMoodPost.ok()).toBeTruthy();
    expect(agentMoodPost.headers()['content-type']).toContain('text/markdown');
    expect(await agentMoodPost.text()).toContain('# 990001');

    expect((await request.get('/agent/mood')).status()).toBe(404);
    expect((await request.get('/agent/mood/990001')).status()).toBe(404);
  });

  test('static proxy endpoints handle invalid requests', async ({ request }) => {
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

  test('static proxy serves bounded YouTube posters without exposing the upstream host', async ({ request }) => {
    const response = await request.get('/static/youtube/aqz-KE-bpKQ/hqdefault.jpg');
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['content-type']).toContain('image/jpeg');
    expect(response.headers()['access-control-allow-origin']).toBe('*');
    expect(await response.text()).toBe('e2e-youtube-poster');

    const directUpstream = await request.get(
      '/static/https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg',
    );
    expect(directUpstream.status()).toBe(400);
  });
});
