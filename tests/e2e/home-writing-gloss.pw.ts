import { devices } from '@playwright/test';
import { expect, test } from './fixtures';

const { defaultBrowserType: _defaultBrowserType, ...iphone13 } = devices['iPhone 13'];

test.describe('Home writing gloss', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('opens the writing gloss inside the desktop viewport', async ({ page }) => {
    await page.goto('/');

    await page.locator('#writing-section [data-gloss-trigger]').hover();

    const popover = page.locator('[data-gloss-pop]');
    const card = page.locator('.gloss__card');
    await expect(popover).toHaveClass(/is-open/);

    const box = await card.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
  });
});

test.describe('Home writing gloss on touch', () => {
  test.use(iphone13);

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('previews on first tap and follows the writing link on second tap', async ({ page }) => {
    await page.goto('/');

    const portal = page.locator('#writing-section [data-gloss-trigger]');
    await portal.tap();
    await expect(page.locator('[data-gloss-pop]')).toHaveClass(/is-open/);

    await Promise.all([
      page.waitForURL(/\/blog\/?$/),
      portal.tap(),
    ]);
  });
});
