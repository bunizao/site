import { afterAll, beforeAll, expect, test } from 'bun:test';
import { chromium, type Browser } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let browser: Browser;
let directory: string;
let source: string;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'turnstile-challenge-'));
  const root = join(import.meta.dir, '../..');
  const entry = join(directory, 'entry.ts');
  await Bun.write(entry, `export * from '${root}/src/features/comments/client/turnstile-token.ts';`);
  const build = await Bun.build({ entrypoints: [entry], target: 'browser', format: 'esm', tsconfig: join(root, 'tsconfig.json') });
  if (!build.success) throw new AggregateError(build.logs, 'Could not bundle turnstile-token');
  source = await build.outputs[0].text();
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL, headless: true });
}, 15_000);

afterAll(async () => {
  await browser?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

test('a forced checkbox survives a press, a failure and a resend, and leaves only on dismiss', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent('<div id="host"></div>');
    const result = await page.evaluate(async (source) => {
      const module = await import(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
      const host = document.getElementById('host')!;
      const log: string[] = [];
      let options: Record<string, any> = {};
      let widgets = 0;
      (window as any).turnstile = {
        render(_container: HTMLElement, next: Record<string, any>) {
          options = next;
          widgets += 1;
          log.push(`render:${next.appearance}`);
          return `w${widgets}`;
        },
        reset(id: string) { log.push(`reset:${id}`); },
        remove(id: string) { log.push(`remove:${id}`); },
      };
      const open = () => host.hasAttribute('data-turnstile-interactive');
      const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
      module.setTurnstileHost('blog_comment_create', host);

      let settled = null as string | null;
      void module.challengeTurnstile('key', 'blog_comment_create').then((token: string) => { settled = token; });
      await tick();
      const openAfterRender = open();

      // The reader presses the box, and Cloudflare fails the challenge.
      options['before-interactive-callback']();
      options['after-interactive-callback']();
      const openAfterPress = open();
      options['error-callback']();
      options['timeout-callback']();
      await tick();
      const pendingAfterFailure = settled === null;

      // Cloudflare's own retry passes.
      options.callback('good');
      await tick();
      const token = settled;
      const openAfterPass = open();

      // The resend was refused too: the next challenge reuses the box.
      module.releaseTurnstileToken('blog_comment_create');
      const second = module.challengeTurnstile('key', 'blog_comment_create');
      await tick();
      options.callback('again');
      const secondToken = await second;
      const openAfterSecond = open();

      module.dismissTurnstileChallenge('blog_comment_create');
      const openAfterDismiss = open();
      void module.getTurnstileToken('key', 'blog_comment_create');
      await tick();

      return {
        openAfterRender, openAfterPress, pendingAfterFailure, token, openAfterPass,
        secondToken, openAfterSecond, openAfterDismiss, log,
      };
    }, source);

    expect(result.openAfterRender).toBe(true);
    expect(result.openAfterPress).toBe(true);
    expect(result.pendingAfterFailure).toBe(true);
    expect(result.token).toBe('good');
    expect(result.openAfterPass).toBe(true);
    expect(result.secondToken).toBe('again');
    expect(result.openAfterSecond).toBe(true);
    expect(result.openAfterDismiss).toBe(false);
    expect(result.log).toEqual([
      'render:always',
      'reset:w1',
      'remove:w1',
      'render:interaction-only',
    ]);
  } finally { await page.close(); }
});
