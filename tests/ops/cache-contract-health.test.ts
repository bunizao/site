import { describe, expect, test } from 'bun:test';
import { expectHttpOk } from './http-diagnostics';

const SITE = (process.env.SITE_URL || process.env.PUBLIC_SITE_URL || 'https://buxx.me').replace(/\/+$/, '');
const HTML_ACCEPT = 'text/html,application/xhtml+xml';
const REQUEST_TIMEOUT_MS = 8_000;
const TEST_TIMEOUT_MS = 55_000;

async function request(path: string, accept = 'application/json', requireOk = true): Promise<{ response: Response; body: string }> {
  const response = await fetch(new URL(path, SITE), {
    redirect: 'manual',
    headers: { Accept: accept, 'Accept-Language': 'en-US,en;q=0.9' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (requireOk) await expectHttpOk(response, `GET ${path}`);
  // Drain each response before the next request so cache fills can complete.
  const body = await response.text();
  return { response, body };
}

function expectNoStore(response: Response, path: string): void {
  expect(response.headers.get('Cache-Control'), `${path} Cache-Control`).toMatch(/\bno-store\b/i);
  expect([null, 'BYPASS', 'DYNAMIC'], `${path} must not enter the platform cache`)
    .toContain(response.headers.get('Cf-Cache-Status'));
}

function expectMoodVariance(response: Response, path: string): void {
  const vary = (response.headers.get('Vary') ?? '').toLowerCase().split(',').map((token) => token.trim());
  for (const header of ['host', 'accept', 'accept-language', 'cookie']) {
    expect(vary, `${path} Vary must include ${header}`).toContain(header);
  }
  expect(response.headers.has('X-Buxx-Cache-Ready'), `${path} leaked its internal readiness header`).toBe(false);
  expect(response.headers.has('X-Buxx-Mood-Page-Cache'), `${path} restored the retired native cache`).toBe(false);
  expect(response.headers.has('X-Buxx-Edge-Cache'), `${path} restored the retired native cache`).toBe(false);
}

function incompleteMoodHtml(path: string, body: string): boolean {
  return path === '/mood'
    ? !body.includes('data-mood-initial-feed') || !body.includes('data-mood-id=')
    : body.includes('data-mood-preview-pending="true"');
}

async function expectWarm(path: string, accept: string, check: (response: Response, body: string) => void | false): Promise<void> {
  let lastStatus: string | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await Bun.sleep(attempt === 0 ? 350 : 1_000);
    const { response, body } = await request(path, accept);
    if (check(response, body) === false) return;
    lastStatus = response.headers.get('Cf-Cache-Status');
    if (lastStatus === 'HIT' || lastStatus === 'UPDATING') return;
  }
  throw new Error(`${path} stayed ${lastStatus ?? 'without Cf-Cache-Status'} after two warm reads`);
}

describe('production cache contracts', () => {
  test('ready Mood HTML uses the platform cache with complete variance', async () => {
    for (const path of ['/mood', '/mood/3618']) {
      const { response, body } = await request(path, HTML_ACCEPT);
      expectMoodVariance(response, path);
      // Incomplete renders have a no-store contract; content health is checked separately.
      if (incompleteMoodHtml(path, body)) {
        expectNoStore(response, path);
        continue;
      }
      expect(response.headers.get('Cache-Control'), `${path} ready HTML`).toMatch(/\bpublic\b/);
      if (path === '/mood') {
        const markdown = await request(path, 'text/markdown');
        expect(markdown.response.headers.get('Content-Type')).toContain('text/markdown');
        expect(markdown.response.headers.get('Vary'), 'Mood Markdown must preserve the HTML variant key')
          .toBe(response.headers.get('Vary'));
        if (new URL(SITE).hostname === 'buxx.me') {
          const redirect = await request('https://www.buxx.me/mood', HTML_ACCEPT, false);
          expect(redirect.response.status).toBe(301);
          expect(redirect.response.headers.get('Vary'), 'The www redirect must preserve the HTML variant key')
            .toBe(response.headers.get('Vary'));
        }
      }
      await expectWarm(path, HTML_ACCEPT, (warm, html) => {
        expectMoodVariance(warm, path);
        if (incompleteMoodHtml(path, html)) {
          expectNoStore(warm, path);
          return false;
        }
      });
    }
  }, { timeout: TEST_TIMEOUT_MS });

  test('public Mood JSON keeps browser freshness zero and warms the platform cache', async () => {
    const path = '/api/v2/mood?limit=1';
    const check = (response: Response, body: string) => {
      const cacheControl = response.headers.get('Cache-Control') ?? '';
      expect(cacheControl, `${path} browser policy`).toMatch(/(?:^|,)\s*max-age=0(?:,|$)/i);
      expect(cacheControl, `${path} public policy`).toMatch(/\bpublic\b/);
      expect(JSON.parse(body).posts?.length, `${path} returned no public posts`).toBeGreaterThan(0);
    };
    const { response, body } = await request(path);
    check(response, body);
    await expectWarm(path, 'application/json', check);
  }, { timeout: TEST_TIMEOUT_MS });

  test('private, reader, invalid, and fresh reads remain no-store', async () => {
    for (const [path, status] of [
      ['/api/notify/manage', 401],
      ['/api/v2/reader/me', 200],
      ['/api/v2/mood?before=invalid', 400],
      ['/api/v2/mood?limit=1&fresh=1&fallback=0', 200],
    ] as const) {
      const { response } = await request(path, 'application/json', false);
      expect(response.status, `GET ${path}; redirects are not followed`).toBe(status);
      expectNoStore(response, path);
    }
  }, { timeout: TEST_TIMEOUT_MS });
});
