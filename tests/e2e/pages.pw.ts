import { expect, test } from './fixtures';

test.describe('Standalone pages', () => {
  test('renders the privacy page with the simplified home nav', async ({ page }) => {
    await page.goto('/privacy');

    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
    await expect(page.locator('.page-updated')).toContainText('Updated:');
    await expect(page.locator('[data-site-nav] .nav-link')).toHaveCount(1);
    await expect(page.locator('[data-site-nav] .nav-link')).toHaveText('buxx.me');
    await expect(page.locator('.page-content')).toContainText('This Privacy Policy explains how this website collects');
  });

  test('uses the home header-actions style on privacy without switching the nav variant', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/privacy');

    const state = await page.evaluate(() => {
      const headerActions = document.querySelector('[data-header-actions]');
      const toggle = document.querySelector('[data-theme-toggle]');
      const navLinks = document.querySelectorAll('[data-site-nav] .nav-link');

      if (!(headerActions instanceof HTMLElement) || !(toggle instanceof HTMLElement)) {
        return null;
      }

      const toggleStyles = window.getComputedStyle(toggle);
      return {
        hasHomeHeaderActions: headerActions.classList.contains('global-header-actions--home'),
        navLinkCount: navLinks.length,
        toggleBackground: toggleStyles.backgroundColor,
        toggleBorder: toggleStyles.borderTopColor,
      };
    });

    expect(state).not.toBeNull();
    expect(state?.hasHomeHeaderActions).toBe(true);
    expect(state?.navLinkCount).toBe(1);
    expect(state?.toggleBackground).toBe('rgba(0, 0, 0, 0)');
    expect(state?.toggleBorder).toBe('rgba(0, 0, 0, 0)');
  });

  test('redirects /mood/subscribe to /mood and auto-opens the notify panel', async ({ page }) => {
    await page.goto('/mood/subscribe');

    await expect(page).toHaveURL(/\/mood$/);
    await expect(page.locator('.notify-panel')).toHaveClass(/is-open/, { timeout: 30_000 });
    await expect(page.locator('[data-notify-email]')).toBeVisible();
  });
});
