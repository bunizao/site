import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { chromium, type Browser } from '@playwright/test';
import { join } from 'node:path';

// The mood search UI now lives in the site-wide ⌘K palette; only the pure FTS
// helpers survive here. Build them for the browser so the isSafeSnippetHtml
// allowlist is exercised in a real DOM-adjacent runtime.
let browser: Browser;
let moduleSource = '';

beforeAll(async () => {
  const build = await Bun.build({
    entrypoints: [join(import.meta.dir, '../../src/features/mood/shared/search.ts')],
    format: 'esm',
    target: 'browser',
  });
  if (!build.success) {
    throw new AggregateError(build.logs, 'Could not build mood search helpers for browser tests');
  }
  moduleSource = await build.outputs[0].text();
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL,
    headless: true,
  });
}, 15_000);

afterAll(async () => {
  await browser?.close();
});

describe('isSafeSnippetHtml', () => {
  test('accepts plain text and <mark>-only markup, rejects other tags', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent('<div></div>');
      const result = await page.evaluate(async ({ source }) => {
        const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        try {
          const { isSafeSnippetHtml } = await import(moduleUrl);
          return {
            plain: isSafeSnippetHtml('a calm morning'),
            mark: isSafeSnippetHtml('a <mark>calm</mark> morning'),
            markClosed: isSafeSnippetHtml('<mark>x</mark> and <mark>y</mark>'),
            img: isSafeSnippetHtml('<img src=x onerror=alert(1)>'),
            script: isSafeSnippetHtml('<script>alert(1)</script>'),
            partial: isSafeSnippetHtml('<mark>ok</mark> <b>bad</b>'),
          };
        } finally {
          URL.revokeObjectURL(moduleUrl);
        }
      }, { source: moduleSource });

      expect(result.plain).toBe(true);
      expect(result.mark).toBe(true);
      expect(result.markClosed).toBe(true);
      expect(result.img).toBe(false);
      expect(result.script).toBe(false);
      expect(result.partial).toBe(false);
    } finally {
      await page.close();
    }
  });
});

describe('searchMoods', () => {
  test('skips too-short queries, builds the endpoint URL, and surfaces HTTP errors', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent('<div></div>');
      const result = await page.evaluate(async ({ source }) => {
        const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        try {
          const { searchMoods } = await import(moduleUrl);

          const requested: string[] = [];
          let mode: 'ok' | 'error' = 'ok';
          const originalFetch = window.fetch;
          window.fetch = (async (url: string) => {
            requested.push(String(url));
            if (mode === 'error') return new Response('boom', { status: 500 });
            return new Response(
              JSON.stringify({ results: [{ id: '1', datetime: '', snippet: 'x', tags: [] }] }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            );
          }) as unknown as typeof fetch;

          try {
            const short = await searchMoods('c');
            const ok = await searchMoods('calm', { limit: 6 });
            mode = 'error';
            let threw = false;
            try {
              await searchMoods('anger');
            } catch {
              threw = true;
            }
            return { shortLen: short.length, okLen: ok.length, requested, threw };
          } finally {
            window.fetch = originalFetch;
          }
        } finally {
          URL.revokeObjectURL(moduleUrl);
        }
      }, { source: moduleSource });

      // 'c' is below MOOD_MIN_QUERY_LENGTH — no request fired.
      expect(result.shortLen).toBe(0);
      expect(result.okLen).toBe(1);
      expect(result.requested).toHaveLength(2);
      expect(result.requested[0]).toContain('q=calm');
      expect(result.requested[0]).toContain('limit=6');
      expect(result.threw).toBe(true);
    } finally {
      await page.close();
    }
  });
});
