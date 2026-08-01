import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { chromium, type Browser } from '@playwright/test';
import { join } from 'node:path';

let browser: Browser;
let mediaHydrationSource = '';
let popoverSource = '';

async function buildModule(relativePath: string): Promise<string> {
  const build = await Bun.build({
    entrypoints: [join(import.meta.dir, relativePath)],
    format: 'esm',
    target: 'browser',
  });
  if (!build.success) {
    throw new AggregateError(build.logs, `Could not build ${relativePath} for browser tests`);
  }
  return build.outputs[0].text();
}

beforeAll(async () => {
  [mediaHydrationSource, popoverSource] = await Promise.all([
    buildModule('../../src/features/mood/client/feed-media-hydration.ts'),
    buildModule('../../src/features/mood/client/feed-comments-popover.ts'),
  ]);
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL,
    headless: true,
  });
});

afterAll(async () => {
  await browser?.close();
});

describe('mood feed image fallback', () => {
  test('SSR-shaped img swaps to its fallback on error', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent('<div data-mood-list><img data-fallback-src="/fallback.jpg" src="/broken.jpg"></div>');
      const result = await page.evaluate(async ({ source }) => {
        const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        try {
          const { createFeedMediaHydrator } = await import(moduleUrl);
          const hydrator = createFeedMediaHydrator({ hydrate: async () => {} });
          const list = document.querySelector<HTMLElement>('[data-mood-list]');
          hydrator.applyMediaHints(list!);

          const img = list!.querySelector('img') as HTMLImageElement;
          img.dispatchEvent(new Event('error'));

          return { src: img.getAttribute('src'), applied: img.dataset.fallbackApplied };
        } finally {
          URL.revokeObjectURL(moduleUrl);
        }
      }, { source: mediaHydrationSource });

      expect(result.src).toBe('/fallback.jpg');
      expect(result.applied).toBe('1');
    } finally {
      await page.close();
    }
  });

  test('does not re-swap after the fallback already applied', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent('<div data-mood-list><img data-fallback-src="/fallback.jpg" src="/broken.jpg"></div>');
      const src = await page.evaluate(async ({ source }) => {
        const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        try {
          const { createFeedMediaHydrator } = await import(moduleUrl);
          const hydrator = createFeedMediaHydrator({ hydrate: async () => {} });
          const list = document.querySelector<HTMLElement>('[data-mood-list]');
          hydrator.applyMediaHints(list!);

          const img = list!.querySelector('img') as HTMLImageElement;
          img.dispatchEvent(new Event('error'));
          img.src = '/still-broken.jpg';
          img.dispatchEvent(new Event('error'));
          return img.getAttribute('src');
        } finally {
          URL.revokeObjectURL(moduleUrl);
        }
      }, { source: mediaHydrationSource });

      // Second error must not overwrite the manually re-set src.
      expect(src).toBe('/still-broken.jpg');
    } finally {
      await page.close();
    }
  });
});

describe('mood feed comments popover error state', () => {
  test('failed fetch shows an error state, not the empty state, and retries', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent('');
      const result = await page.evaluate(async ({ source }) => {
        const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        try {
          const { createFeedCommentsPopoverController } = await import(moduleUrl);

          let attempts = 0;
          const originalFetch = window.fetch;
          window.fetch = (async () => {
            attempts += 1;
            if (attempts === 1) {
              throw new Error('network down');
            }
            return new Response(JSON.stringify({ comments: [] }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }) as unknown as typeof fetch;

          try {
            const controller = createFeedCommentsPopoverController({ hydrate: async () => {} });
            controller.init();

            const wrapper = controller.createIndicator({ postId: '42', count: 3, label: '3' });
            document.body.appendChild(wrapper);

            const trigger = wrapper.querySelector('.mood-item-comments') as HTMLElement;
            trigger.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));

            const readState = async () => {
              await new Promise((resolve) => setTimeout(resolve, 30));
              const popover = document.querySelector('.mood-comments-popover') as HTMLElement;
              return {
                text: popover.textContent ?? '',
                hasError: Boolean(popover.querySelector('.mood-comments-popover-error')),
                loaded: popover.dataset.loaded,
              };
            };

            const firstState = await readState();

            // Simulate closing and re-hovering to trigger the retry.
            trigger.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: document.body }));
            await new Promise((resolve) => setTimeout(resolve, 220));
            trigger.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
            const secondState = await readState();

            return { attempts, firstState, secondState };
          } finally {
            window.fetch = originalFetch;
          }
        } finally {
          URL.revokeObjectURL(moduleUrl);
        }
      }, { source: popoverSource });

      expect(result.firstState.hasError).toBe(true);
      expect(result.firstState.text).toContain("Couldn't load comments");
      expect(result.firstState.text).not.toContain('No comments yet');
      // A failed fetch is not cached; the retry hover re-requests.
      expect(result.attempts).toBeGreaterThanOrEqual(2);
      expect(result.secondState.text).toContain('No comments yet');
      expect(result.secondState.hasError).toBe(false);
    } finally {
      await page.close();
    }
  });
});
