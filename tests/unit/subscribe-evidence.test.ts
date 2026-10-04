import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { chromium, type Browser } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

let browser: Browser;
let directory: string;
let entryPath: string;
const assets = new Map<string, string>();

beforeAll(async () => {
  const root = join(import.meta.dir, '../..');
  directory = await mkdtemp(join(tmpdir(), 'subscribe-evidence-'));
  const entry = join(directory, 'entry.ts');
  await Bun.write(entry, `
    import { initSubscribe } from '${root}/src/features/desk/client/subscribe.ts';
    import { initSubscribePanels } from '${root}/src/features/notify/subscribe-panel.ts';
    initSubscribe();
    initSubscribePanels();
    window.subscribeReady = true;
  `);
  const build = await Bun.build({
    entrypoints: [entry], target: 'browser', format: 'esm', splitting: true,
    outdir: join(directory, 'build'), tsconfig: join(root, 'tsconfig.json'),
  });
  if (!build.success) throw new AggregateError(build.logs, 'Could not build subscription fixture');
  for (const output of build.outputs) {
    const path = `/assets/${basename(output.path)}`;
    assets.set(path, await output.text());
    if (output.kind === 'entry-point') entryPath = path;
  }
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL, headless: true });
}, 60_000);

afterAll(async () => {
  await browser?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
}, 30_000);

function markup(surface: 'desk' | 'blog' | 'mood'): string {
  const honey = '<label hidden aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off" /></label>';
  if (surface === 'desk') return `
    <button data-subscribe-open aria-controls="subscribe" aria-expanded="false">Open</button>
    <form id="subscribe" data-channel="blog" hidden>
      ${honey}<input name="email" /><button type="submit">Subscribe</button>
      <p data-subscribe-status></p><div data-subscribe-turnstile></div>
    </form>`;
  return `
    <button data-subscribe-toggle="blog">Open</button>
    <div data-subscribe-panel data-subscribe-id="blog" data-subscribe-source="${surface}">
      <button data-sub-close>Close</button><div data-sub-form-view>
        <form data-sub-form>${honey}<input data-sub-email />
          <input type="checkbox" value="blog" checked data-sub-channel />
          <input type="radio" value="instant" checked data-sub-mode />
          <button type="submit" data-sub-submit>Subscribe</button>
          <span data-sub-submit-spinner></span><p data-sub-error></p><div data-sub-turnstile></div>
        </form>
      </div>
      <div data-sub-success-view><p data-sub-success-text></p><button data-sub-done>Done</button></div>
      <div data-sub-error-view><p data-sub-error-text></p><button data-sub-retry>Retry</button></div>
    </div>`;
}

describe('subscription form evidence', () => {
  for (const surface of ['desk', 'blog', 'mood'] as const) {
    for (const mintFails of [false, true]) {
      test(`${surface} sends optional evidence when token mint ${mintFails ? 'fails' : 'succeeds'}`, async () => {
        const context = await browser.newContext();
        const page = await context.newPage();
        const posts: Record<string, unknown>[] = [];
        let mints = 0;
        await page.route('**/*', async (route) => {
          const path = new URL(route.request().url()).pathname;
          if (assets.has(path)) return route.fulfill({ contentType: 'text/javascript', body: assets.get(path)! });
          if (path === '/api/v2/comments/dwell-token') {
            mints++;
            return route.fulfill({ status: mintFails ? 503 : 200, json: { token: 'minted-token' } });
          }
          if (path === '/api/notify/subscribe') {
            posts.push(route.request().postDataJSON());
            return route.fulfill({ json: { status: 'confirmation_sent' } });
          }
          if (path === '/') return route.fulfill({ contentType: 'text/html', body: markup(surface) });
          return route.fulfill({ status: 204 });
        });
        try {
          await page.goto('https://subscribe.test/');
          await page.addScriptTag({ type: 'module', url: `https://subscribe.test${entryPath}` });
          await page.waitForFunction(() => (window as any).subscribeReady);
          const mint = page.waitForResponse((response) => response.url().endsWith('/api/v2/comments/dwell-token'));
          await page.getByRole('button', { name: 'Open', exact: true }).click();
          await mint;
          await page.locator(surface === 'desk' ? '[name="email"]' : '[data-sub-email]').fill('reader@example.com');
          await page.locator('[name="website"]').evaluate((input: HTMLInputElement) => { input.value = 'bot-field'; });
          const response = page.waitForResponse((one) => one.url().endsWith('/api/notify/subscribe'));
          await page.locator('button[type="submit"]').click();
          await response;
          expect(mints).toBeGreaterThan(0);
          expect(posts).toHaveLength(1);
          expect(posts[0]).toMatchObject({ email: 'reader@example.com', channels: ['blog'], website: 'bot-field', source: surface });
          if (mintFails) expect(posts[0]).not.toHaveProperty('dwellToken');
          else expect(posts[0]?.dwellToken).toBe('minted-token');
          expect(posts[0]).not.toHaveProperty('clientEvidence');
          expect(posts[0]).toHaveProperty('clientFp');
        } finally { await context.close(); }
      }, 30_000);
    }
  }
});
