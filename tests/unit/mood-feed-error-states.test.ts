import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { chromium, type Browser } from '@playwright/test';
import { join } from 'node:path';

let browser: Browser;
let popoverSource = '';

beforeAll(async () => {
  const build = await Bun.build({
    entrypoints: [join(import.meta.dir, '../../src/features/mood/client/feed-comments-popover.ts')],
    format: 'esm',
    target: 'browser',
  });
  if (!build.success) {
    throw new AggregateError(build.logs, 'Could not build feed-comments-popover for browser tests');
  }
  popoverSource = await build.outputs[0].text();
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL,
    headless: true,
  });
}, 15_000);

afterAll(async () => {
  await browser?.close();
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

            // Poll rather than sleep: the close timer and the fetch settle on
            // their own schedule.
            const waitFor = async (check: () => boolean): Promise<void> => {
              for (let attempt = 0; attempt < 200; attempt += 1) {
                if (check()) return;
                await new Promise((resolve) => setTimeout(resolve, 5));
              }
              throw new Error('Timed out waiting for the popover');
            };
            const readState = () => {
              const popover = document.querySelector('.mood-comments-popover') as HTMLElement | null;
              return {
                text: popover?.textContent ?? '',
                hasError: Boolean(popover?.querySelector('.mood-comments-popover-error')),
              };
            };

            await waitFor(() => readState().hasError);
            const firstState = readState();

            // Simulate closing and re-hovering to trigger the retry.
            trigger.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: document.body }));
            await waitFor(() => !wrapper.classList.contains('is-popover-open'));
            trigger.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
            await waitFor(() => readState().text.includes('No comments yet'));
            const secondState = readState();

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
