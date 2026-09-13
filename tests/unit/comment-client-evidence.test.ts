import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { chromium, type Browser, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

let browser: Browser;
let directory: string;
let entryPath: string;
let fingerprintPath: string;
const assets = new Map<string, string>();

beforeAll(async () => {
  const root = join(import.meta.dir, '../..');
  directory = await mkdtemp(join(tmpdir(), 'comment-evidence-'));
  const entry = join(directory, 'entry.ts');
  await Bun.write(entry, `
    import React from '${root}/node_modules/react/index.js';
    import { createRoot } from '${root}/node_modules/react-dom/client.js';
    import ReactionBar from '${root}/src/features/comments/ui/ReactionBar.tsx';
    import { collectClientEvidence, warmClientEvidence } from '${root}/src/features/comments/client/client-evidence.ts';
    window.evidenceReview = {
      collect: collectClientEvidence,
      warm: warmClientEvidence,
      mount: () => createRoot(document.getElementById('root')).render(
        React.createElement(ReactionBar, { count: 0, postId: 'test-post', locale: 'en' })
      ),
    };
  `);
  const build = await Bun.build({
    entrypoints: [entry],
    target: 'browser',
    format: 'esm',
    splitting: true,
    outdir: join(directory, 'build'),
    tsconfig: join(root, 'tsconfig.json'),
  });
  if (!build.success) throw new AggregateError(build.logs, 'Could not build the evidence browser fixture');
  for (const output of build.outputs) {
    const path = `/assets/${basename(output.path)}`;
    const source = await output.text();
    assets.set(path, source);
    if (output.kind === 'entry-point') entryPath = path;
    if (source.includes('function clientFingerprint(')) fingerprintPath = path;
  }
  if (!entryPath || !fingerprintPath) throw new Error('Missing evidence fixture modules');
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL, headless: true });
}, 15_000);

afterAll(async () => {
  await browser?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

type Mode = 'normal' | 'module' | 'storage' | 'fingerprint' | 'late-rejection';

async function fixture(mode: Mode, run: (page: Page, posts: Record<string, unknown>[], errors: string[]) => Promise<void>) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const posts: Record<string, unknown>[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (mode === 'module' && path === fingerprintPath) return;
    if (assets.has(path)) {
      await route.fulfill({ contentType: 'text/javascript', body: assets.get(path)! });
    } else if (request.method() === 'POST') {
      posts.push(request.postDataJSON());
      await route.fulfill({ json: { reaction: { count: 1, reacted: true, reactors: [] } } });
    } else if (path === '/api/v2/reactions') {
      await route.fulfill({ json: { reactions: { 'post:test-post': [{ count: 0, reacted: false, reactors: [] }] } } });
    } else {
      await route.fulfill({
        contentType: 'text/html',
        body: '<html><body><div id="root"></div><div class="blog-compose"><textarea></textarea></div></body></html>',
      });
    }
  });
  try {
    await page.goto('https://evidence.test/');
    await page.evaluate((mode) => {
      localStorage.setItem('blog:reaction-pass-until', String(Date.now() + 3_600_000));
      if (mode === 'storage') Object.defineProperty(window, 'indexedDB', { value: { open: () => ({}) } });
      if (mode === 'fingerprint' || mode === 'late-rejection') {
        Object.defineProperty(navigator, 'userAgentData', {
          value: {
            getHighEntropyValues: () => new Promise((_, reject) => {
              if (mode === 'late-rejection') setTimeout(() => reject(new Error('late probe failure')), 2_200);
            }),
          },
        });
      }
    }, mode);
    await page.addScriptTag({ type: 'module', url: `https://evidence.test${entryPath}` });
    await page.waitForFunction(() => Boolean((window as any).evidenceReview));
    await run(page, posts, errors);
  } finally {
    await context.close();
  }
}

describe('optional comment evidence', () => {
  for (const mode of ['module', 'storage', 'fingerprint'] as const) {
    test(`sends a reaction within the shared deadline when ${mode} stalls`, async () => {
      await fixture(mode, async (page, posts, errors) => {
        await page.evaluate(() => (window as any).evidenceReview.mount());
        const started = Date.now();
        const response = page.waitForResponse((one) => one.url().endsWith('/api/v2/reactions/toggle'), { timeout: 2_700 });
        await page.locator('.blog-react__card').click();
        await response;
        expect(Date.now() - started).toBeLessThan(2_700);
        expect(posts).toHaveLength(1);
        expect(posts[0]).not.toHaveProperty('clientFp');
        expect(posts[0]).not.toHaveProperty('storageId');
        expect(await page.locator('.blog-react__card').getAttribute('aria-pressed')).toBe('true');
        expect(errors).toEqual([]);
      });
    });
  }

  test('retains working fingerprint and storage evidence', async () => {
    await fixture('normal', async (page, posts, errors) => {
      await page.evaluate(() => (window as any).evidenceReview.mount());
      const response = page.waitForResponse((one) => one.url().endsWith('/api/v2/reactions/toggle'));
      await page.locator('.blog-react__card').click();
      await response;
      expect(posts[0]?.clientFp).toBeObject();
      expect(posts[0]?.storageId).toMatch(/^[0-9a-f]{32}$/);
      expect(errors).toEqual([]);
    });
  });

  test('captures comment interaction before waiting for fingerprint probes', async () => {
    await fixture('normal', async (page, _posts, errors) => {
      const result = await page.evaluate(async () => {
        const review = (window as any).evidenceReview;
        review.warm();
        await review.collect({ kind: 'comment' });
        const field = document.querySelector('textarea')!;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        const submitted = review.collect({ kind: 'comment', armedAt: Math.round(performance.now()) });
        field.dispatchEvent(new Event('input', { bubbles: true }));
        const first = await submitted;
        const later = await review.collect({ kind: 'comment' });
        return { first: first.interaction.inputEvents, later: later.interaction.inputEvents };
      });
      expect(result).toEqual({ first: 1, later: 2 });
      expect(errors).toEqual([]);
    });
  });

  test('clears the deadline timer when collection completes early', async () => {
    await fixture('normal', async (page, _posts, errors) => {
      const pendingTimers = await page.evaluate(async () => {
        const review = (window as any).evidenceReview;
        review.warm();
        await review.collect({ kind: 'reaction' });
        const originalSetTimeout = window.setTimeout;
        const originalClearTimeout = window.clearTimeout;
        const timers = new Set<number>();
        window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
          const timer = originalSetTimeout(handler, delay, ...args);
          if (delay === 2_000) timers.add(timer);
          return timer;
        }) as typeof window.setTimeout;
        window.clearTimeout = (timer?: number) => {
          if (timer !== undefined) timers.delete(timer);
          originalClearTimeout(timer);
        };
        try {
          await review.collect({ kind: 'reaction' });
          return timers.size;
        } finally {
          window.setTimeout = originalSetTimeout;
          window.clearTimeout = originalClearTimeout;
        }
      });
      expect(pendingTimers).toBe(0);
      expect(errors).toEqual([]);
    });
  });

  test('handles a probe rejection after the deadline without delaying the write', async () => {
    await fixture('late-rejection', async (page, posts, errors) => {
      await page.evaluate(() => (window as any).evidenceReview.mount());
      const response = page.waitForResponse((one) => one.url().endsWith('/api/v2/reactions/toggle'));
      await page.locator('.blog-react__card').click();
      await response;
      await page.waitForTimeout(350);
      expect(posts).toHaveLength(1);
      expect(posts[0]).not.toHaveProperty('clientFp');
      expect(errors).toEqual([]);
    });
  });
});
