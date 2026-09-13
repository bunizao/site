import { afterAll, beforeAll, expect, test } from 'bun:test';
import { chromium, type Browser } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let browser: Browser;
let directory: string;
let source: string;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'comment-telemetry-'));
  const root = join(import.meta.dir, '../..');
  const entry = join(directory, 'entry.ts');
  await Bun.write(entry, `
    export * from '${root}/src/features/comments/client/telemetry.ts';
    export * from '${root}/src/features/comments/client/turnstile-token.ts';
  `);
  const build = await Bun.build({ entrypoints: [entry], target: 'browser', format: 'esm', tsconfig: join(root, 'tsconfig.json') });
  if (!build.success) throw new AggregateError(build.logs, 'Could not bundle telemetry');
  source = await build.outputs[0].text();
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL, headless: true });
}, 15_000);

afterAll(async () => {
  await browser?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

test('a warmed prompt and a forced retry count separately without duplicate callbacks or reports', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent('<div id="host"></div>');
    const reports = await page.evaluate(async (source) => {
      const module = await import(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
      const blobs: Blob[] = [];
      Object.defineProperty(navigator, 'sendBeacon', { value: (_url: string, blob: Blob) => { blobs.push(blob); return true; } });
      (window as any).turnstile = {
        render(_host: HTMLElement, options: Record<string, any>) {
          options['before-interactive-callback']();
          options['before-interactive-callback']();
          options['after-interactive-callback']();
          options.callback('token');
          return 'widget';
        },
        reset() {},
        remove() {},
      };
      module.setTurnstileHost('blog_comment_create', document.getElementById('host'));
      await module.getTurnstileToken('fixture-key', 'blog_comment_create');
      const attempt = module.beginWriteTelemetry('comment', 'blog_comment_create');
      attempt.captureChallenges();
      module.releaseTurnstileToken('blog_comment_create');
      await module.challengeTurnstile('fixture-key', 'blog_comment_create');
      attempt.captureChallenges();
      attempt.finish('accepted');
      attempt.finish('http_error');
      module.releaseTurnstileToken('blog_comment_create');
      module.beginWriteTelemetry('reaction', 'blog_comment_create').finish('accepted');
      return await Promise.all(blobs.map(async (blob) => JSON.parse(await blob.text())));
    }, source);
    expect(reports).toEqual([
      { kind: 'comment', outcome: 'accepted', challenges: 2 },
      { kind: 'reaction', outcome: 'accepted', challenges: 0 },
    ]);
  } finally { await page.close(); }
});

test('a failed reporting transport cannot delay or reject the write completion', async () => {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.setContent('<div></div>');
    const result = await page.evaluate(async (source) => {
      const module = await import(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
      Object.defineProperty(navigator, 'sendBeacon', { value: () => false });
      const requests: Array<{ url: string; options: RequestInit }> = [];
      window.fetch = ((url: string, options: RequestInit) => {
        requests.push({ url, options });
        return Promise.reject(new Error('report network unavailable'));
      }) as typeof window.fetch;
      const returned = module.beginWriteTelemetry('reaction', 'blog_reaction').finish('network_error');
      await new Promise((resolve) => setTimeout(resolve, 0));
      return { returnedUndefined: returned === undefined, requests };
    }, source);
    expect(result.returnedUndefined).toBe(true);
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0]?.url).toBe('/api/v2/comments/telemetry');
    expect(result.requests[0]?.options.keepalive).toBe(true);
    expect(JSON.parse(result.requests[0]?.options.body as string)).toEqual({ kind: 'reaction', outcome: 'network_error', challenges: 0 });
    expect(errors).toEqual([]);
  } finally { await page.close(); }
});
