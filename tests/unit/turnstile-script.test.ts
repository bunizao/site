import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { chromium, type Browser } from '@playwright/test';
import { join } from 'node:path';

let browser: Browser;
let source = '';

beforeAll(async () => {
  const build = await Bun.build({
    entrypoints: [join(import.meta.dir, '../../src/lib/turnstile-script.ts')],
    format: 'esm',
    target: 'browser',
  });
  if (!build.success) throw new AggregateError(build.logs, 'Could not build the Turnstile loader');
  source = await build.outputs[0].text();
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL, headless: true });
}, 15_000);

afterAll(async () => {
  await browser?.close();
});

describe('shared Turnstile script readiness', () => {
  test('waits for the API when another consumer inserted the script first', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent('<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"></script>');
      const result = await page.evaluate(async (moduleSource) => {
        const moduleUrl = URL.createObjectURL(new Blob([moduleSource], { type: 'text/javascript' }));
        try {
          const { loadTurnstileScript } = await import(moduleUrl);
          const pending = loadTurnstileScript();
          window.setTimeout(() => {
            (window as unknown as { turnstile: unknown }).turnstile = {
              render: () => 'widget',
              reset: () => undefined,
            };
          }, 40);
          const api = await pending;
          return {
            ready: Boolean(api && typeof api.render === 'function'),
            scripts: document.querySelectorAll('script[src*="challenges.cloudflare.com/turnstile"]').length,
          };
        } finally {
          URL.revokeObjectURL(moduleUrl);
        }
      }, source);
      expect(result).toEqual({ ready: true, scripts: 1 });
    } finally {
      await page.close();
    }
  });
});
