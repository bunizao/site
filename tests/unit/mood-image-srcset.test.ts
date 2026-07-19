import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { chromium, type Browser } from '@playwright/test';
import { join } from 'node:path';

import {
  MOOD_ARCHIVE_IMAGE_WIDTHS,
  buildArchiveSrcSet,
  isArchiveImageUrl,
  withWidth,
} from '../../src/features/mood/shared/image-srcset';

describe('isArchiveImageUrl', () => {
  test('matches relative and absolute archive proxy URLs', () => {
    expect(isArchiveImageUrl('/api/v2/images/mood/3641/0')).toBe(true);
    expect(isArchiveImageUrl('https://buxx.me/api/v2/images/mood/3641/0')).toBe(true);
    expect(isArchiveImageUrl('/v2/images/mood/3641/0')).toBe(true);
  });

  test('rejects external and legacy URLs', () => {
    expect(isArchiveImageUrl('https://cdn4.telesco.pe/file/photo.jpg')).toBe(false);
    expect(isArchiveImageUrl('/static/https:/t.me/i/emoji/1.webp')).toBe(false);
    expect(isArchiveImageUrl('')).toBe(false);
  });
});

describe('withWidth', () => {
  test('adds the width param to a bare relative URL', () => {
    expect(withWidth('/api/v2/images/mood/3641/0', 640)).toBe('/api/v2/images/mood/3641/0?w=640');
  });

  test('preserves existing query params and stays absolute for absolute URLs', () => {
    expect(withWidth('https://buxx.me/api/v2/images/mood/3641/0?x=1', 320))
      .toBe('https://buxx.me/api/v2/images/mood/3641/0?x=1&w=320');
  });

  test('replaces an existing width param', () => {
    expect(withWidth('/api/v2/images/mood/3641/0?w=320', 800)).toBe('/api/v2/images/mood/3641/0?w=800');
  });
});

describe('buildArchiveSrcSet', () => {
  test('emits a full-width srcset for archive URLs', () => {
    const result = buildArchiveSrcSet('/api/v2/images/mood/3641/0');

    expect(result.src).toBe('/api/v2/images/mood/3641/0');
    expect(result.srcset?.split(', ')).toHaveLength(MOOD_ARCHIVE_IMAGE_WIDTHS.length);
    expect(result.srcset).toContain('/api/v2/images/mood/3641/0?w=320 320w');
    expect(result.srcset).toContain('/api/v2/images/mood/3641/0?w=1200 1200w');
    expect(result.sizes).toBeTruthy();
  });

  test('keeps existing query params inside the srcset entries', () => {
    const result = buildArchiveSrcSet('/api/v2/images/mood/3641/0?v=2');

    expect(result.srcset).toContain('/api/v2/images/mood/3641/0?v=2&w=480 480w');
  });

  test('returns src only for external URLs', () => {
    const result = buildArchiveSrcSet('https://cdn4.telesco.pe/file/photo.jpg');

    expect(result).toEqual({ src: 'https://cdn4.telesco.pe/file/photo.jpg' });
  });
});

describe('applyResponsiveImage DOM behavior', () => {
  let browser: Browser;
  let mediaHydrationSource = '';

  beforeAll(async () => {
    const build = await Bun.build({
      entrypoints: [join(import.meta.dir, '../../src/features/mood/client/feed-media-hydration.ts')],
      format: 'esm',
      target: 'browser',
    });
    if (!build.success) {
      throw new AggregateError(build.logs, 'Could not build feed-media-hydration for browser tests');
    }
    mediaHydrationSource = await build.outputs[0].text();
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser?.close();
  });

  test('sets srcset for archive URLs and clears it on non-archive fallback swap', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent('<img data-fallback-src="https://cdn4.telesco.pe/file/fallback.jpg">');
      const result = await page.evaluate(async ({ source }) => {
        const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        try {
          const { createFeedMediaHydrator } = await import(moduleUrl);
          const hydrator = createFeedMediaHydrator({ hydrate: async () => {} });
          const img = document.querySelector('img') as HTMLImageElement;

          hydrator.applyResponsiveImage(img, '/api/v2/images/mood/3641/0');
          const afterApply = {
            src: img.getAttribute('src'),
            srcset: img.getAttribute('srcset'),
            sizes: img.getAttribute('sizes'),
          };

          hydrator.attachImageFallback(img);
          img.dispatchEvent(new Event('error'));
          const afterFallback = {
            src: img.getAttribute('src'),
            srcset: img.getAttribute('srcset'),
            sizes: img.getAttribute('sizes'),
          };

          return { afterApply, afterFallback };
        } finally {
          URL.revokeObjectURL(moduleUrl);
        }
      }, { source: mediaHydrationSource });

      expect(result.afterApply.src).toBe('/api/v2/images/mood/3641/0');
      expect(result.afterApply.srcset).toContain('?w=320 320w');
      expect(result.afterApply.sizes).toBeTruthy();

      // Fallback swap to a non-archive URL must clear width negotiation.
      expect(result.afterFallback.src).toBe('https://cdn4.telesco.pe/file/fallback.jpg');
      expect(result.afterFallback.srcset).toBeNull();
      expect(result.afterFallback.sizes).toBeNull();
    } finally {
      await page.close();
    }
  });

  test('deferred hydration applies srcset for archive URLs', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent('<img data-deferred-src="/api/v2/images/mood/3641/1">');
      const result = await page.evaluate(async ({ source }) => {
        const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        try {
          const { createFeedMediaHydrator } = await import(moduleUrl);
          const hydrator = createFeedMediaHydrator({ hydrate: async () => {} });
          const img = document.querySelector('img') as HTMLImageElement;
          hydrator.hydrateDeferredImage(img);
          return {
            src: img.getAttribute('src'),
            srcset: img.getAttribute('srcset'),
          };
        } finally {
          URL.revokeObjectURL(moduleUrl);
        }
      }, { source: mediaHydrationSource });

      expect(result.src).toBe('/api/v2/images/mood/3641/1');
      expect(result.srcset).toContain('/api/v2/images/mood/3641/1?w=640 640w');
    } finally {
      await page.close();
    }
  });
});
