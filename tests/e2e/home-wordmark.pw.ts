import { devices } from '@playwright/test';
import { expect, test } from './fixtures';

const { defaultBrowserType: _defaultBrowserType, ...iphone13 } = devices['iPhone 13'];

test.describe('Home publication wordmark', () => {
  test('loads the shared lockup without viewport overflow', async ({ page }) => {
    await page.goto('/');

    const portal = page.locator('#writing-section .writing-portal');
    const wordmark = portal.locator('[data-site-wordmark-variant="home"]');
    await wordmark.scrollIntoViewIfNeeded();
    await expect(wordmark).toBeVisible();
    await expect(portal.locator('.site-wordmark__cjk')).toHaveText('無人之境');
    await expect(portal.locator('.site-wordmark__wake')).toHaveText('sillage');
    await expect(page.locator('[data-gloss]')).toHaveCount(0);

    await expect.poll(() => page.evaluate(() => document.fonts.check('28px "WenKai Lockup"', '無人之境'))).toBe(true);

    const box = await portal.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
  });

  test('removes lockup motion when reduced motion is requested', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    const wordmark = page.locator('#writing-section [data-site-wordmark]');
    await wordmark.scrollIntoViewIfNeeded();
    await expect(wordmark.locator('.site-wordmark__character').first()).toHaveCSS('animation-name', 'none');
    await expect(wordmark.locator('.site-wordmark__latin')).toHaveCSS('clip-path', 'none');
  });

  test('runs the wake from the homepage doorway only', async ({ page }) => {
    await page.goto('/');

    const portal = page.locator('#writing-section .writing-portal');
    const wake = portal.locator('.site-wordmark__wake');
    await portal.scrollIntoViewIfNeeded();
    await expect(page.locator('#writing-section')).toHaveClass(/is-settled/);
    await expect(wake).toHaveCSS('background-position', '150% 0px');

    await portal.hover();
    await expect(wake).toHaveCSS('background-position', '-60% 0px');

    await page.mouse.move(0, 0);
    await expect(wake).toHaveCSS('background-position', '150% 0px');

    await page.locator('#writing-section .post-item').first().focus();
    await page.keyboard.press('Shift+Tab');
    await expect(portal).toBeFocused();
    await expect(wake).toHaveCSS('background-position', '-60% 0px');
  });
});

test.describe('Home publication wordmark on touch', () => {
  test.use(iphone13);

  test('follows the writing link on the first tap', async ({ page }) => {
    await page.goto('/');

    const portal = page.locator('#writing-section .writing-portal');
    await Promise.all([
      page.waitForURL(/\/blog\/?$/),
      portal.tap(),
    ]);
  });
});
