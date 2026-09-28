// The owner's site-wide email rule reaches a blog page through the first
// page's `policy.requireVerifiedEmail`, never through the tags the page was
// built from. The controller then redraws the address as required, with the
// same three marks IdentityRow.astro draws for `#comments-verified`, and the
// box refuses an empty address before the network does.
//
// The helper runs in Chromium against the identity row's markup; the
// controller's call is a source assertion, the way the repo covers its other
// client scripts (see comment-post-receipt.test.ts).

import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { chromium, type Browser, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

setDefaultTimeout(30_000);

let browser: Browser;
let directory: string;
let script: string;

beforeAll(async () => {
  const root = join(import.meta.dir, '../..');
  directory = await mkdtemp(join(tmpdir(), 'comment-require-email-'));
  const entry = join(directory, 'entry.ts');
  await Bun.write(entry, `
    import { markEmailRequired, validateCompose } from '${root}/src/features/comments/compose-validate.ts';
    window.composeReview = { markEmailRequired, validateCompose };
  `);
  const build = await Bun.build({ entrypoints: [entry], target: 'browser', format: 'esm', tsconfig: join(root, 'tsconfig.json') });
  if (!build.success) throw new AggregateError(build.logs, 'Could not build the compose fixture');
  script = await build.outputs[0].text();
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL, headless: true });
}, 60_000);

afterAll(async () => {
  await browser?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

/** A box as CommentForm.astro draws it with the address optional. */
const box = (locale: 'en' | 'zh') => `
  <section data-locale="${locale}">
    <div class="blog-compose" data-phase="anonymous">
      <p data-compose-error hidden><span data-compose-error-text></span></p>
      <div class="blog-compose__identity" data-compose-identity>
        <input class="blog-compose__input blog-compose__input--name" type="text" required value="Ada">
        <input class="blog-compose__input" type="email" placeholder="optional">
      </div>
      <textarea class="blog-compose__field">A comment</textarea>
    </div>
  </section>`;

async function withBox(locale: 'en' | 'zh', run: (page: Page) => Promise<void>): Promise<void> {
  const page = await browser.newPage();
  try {
    await page.setContent(box(locale));
    await page.addScriptTag({ type: 'module', content: script });
    await page.waitForFunction(() => Boolean((window as any).composeReview));
    await run(page);
  } finally {
    await page.close();
  }
}

const validate = (page: Page) => page.evaluate(() => (window as any).composeReview.validateCompose(document.querySelector('.blog-compose')));
const mark = (page: Page) => page.evaluate(() => (window as any).composeReview.markEmailRequired(document.querySelector('.blog-compose')));

describe('site-wide email rule on the public page', () => {
  test('a box drawn optional sends without an address', async () => {
    await withBox('en', async (page) => {
      expect(await validate(page)).toBe(true);
    });
  });

  test('marked, the box draws the address as the tag does and refuses it empty', async () => {
    await withBox('en', async (page) => {
      await mark(page);
      const email = page.locator('input[type="email"]');
      expect(await page.locator('.blog-compose').getAttribute('data-require-email')).toBe('true');
      expect(await email.evaluate((input: HTMLInputElement) => input.required)).toBe(true);
      expect(await email.getAttribute('placeholder')).toBe('Email (required)');

      expect(await validate(page)).toBe(false);
      expect(await email.getAttribute('aria-invalid')).toBe('true');
      expect(await page.locator('[data-compose-error-text]').textContent()).toContain('This post needs an email');

      await email.fill('ada@example.com');
      expect(await validate(page)).toBe(true);
    });
  });

  test('the placeholder follows the page locale', async () => {
    await withBox('zh', async (page) => {
      await mark(page);
      expect(await page.locator('input[type="email"]').getAttribute('placeholder')).toBe('邮箱（必填）');
    });
  });
});

test('the controller marks both boxes from the first page, before drawing the mode', () => {
  const controller = readFileSync(new URL('../../src/features/comments/client/comments-controller.ts', import.meta.url), 'utf8');
  const bootstrap = controller.slice(controller.indexOf('async function bootstrap'), controller.indexOf('function clearSkeleton'));
  const rule = bootstrap.indexOf('if (pageResult.policy?.requireVerifiedEmail');
  expect(rule).toBeGreaterThan(-1);
  expect(bootstrap.slice(rule)).toMatch(/if \(compose\) markEmailRequired\(compose\);\s+markEmailRequired\(replyBox\);/);
  expect(rule).toBeLessThan(bootstrap.indexOf("if (mode === 'off')"));
});

test('the mood thread marks its box from the site page it already reads', () => {
  const controller = readFileSync(new URL('../../src/features/mood/client/detail-comments-controller.ts', import.meta.url), 'utf8');
  const rule = controller.indexOf('if (sitePage?.policy?.requireVerifiedEmail)');
  expect(rule).toBeGreaterThan(controller.indexOf('applyMode(commentsSection, sitePage?.policy?.mode);'));
  expect(controller.slice(rule)).toMatch(/querySelector<HTMLElement>\('\[data-mood-compose\]'\);\s+if \(box\) markEmailRequired\(box\);/);
});
