import { expect, test } from './fixtures';

test.describe('Site menu accessibility', () => {
  test('moves focus into the menu when it opens', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/privacy');

    await page.getByRole('button', { name: 'Open menu' }).click();

    await expect(page.getByRole('dialog', { name: 'Site menu' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Home', exact: true })).toBeFocused();
  });

  test('cycles keyboard focus within the open menu', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/privacy');

    await page.getByRole('button', { name: 'Open menu' }).click();

    const menuLinks = page.getByRole('dialog', { name: 'Site menu' }).getByRole('link');
    await page.keyboard.press('Shift+Tab');
    await expect(menuLinks.last()).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(menuLinks.first()).toBeFocused();
  });

  test('Escape closes the reduced-motion menu and restores trigger focus', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/privacy');

    const trigger = page.getByRole('button', { name: 'Open menu' });
    await trigger.click();
    await page.keyboard.press('Escape');

    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).toBeFocused();
    await expect(page.getByRole('dialog', { name: 'Site menu' })).toBeHidden();
  });

  test('prevents background focus while the menu is open', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/privacy');

    const firstMenuLink = page.getByRole('link', { name: 'Home', exact: true });
    const backgroundTargets = page.locator('[data-site-nav], .site-shell, [data-theme-dropdown]');
    await page.getByRole('button', { name: 'Open menu' }).click();

    await expect(backgroundTargets).toHaveCount(3);
    for (const target of await backgroundTargets.all()) {
      await expect(target).toHaveAttribute('inert', '');
    }

    await page.locator('[data-site-brand]').focus();
    await expect(firstMenuLink).toBeFocused();

    await page.keyboard.press('Escape');
    for (const target of await backgroundTargets.all()) {
      await expect(target).not.toHaveAttribute('inert', '');
    }
  });

  test('restores the scroll position after the closing transition', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/privacy');
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo(0, 480);
    });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(400);
    const initialScrollY = await page.evaluate(() => Math.round(window.scrollY));

    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog', { name: 'Site menu' })).toBeHidden();
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(initialScrollY);
  });
});
