import { expect, test } from './fixtures';

test.describe('Standalone pages', () => {
  test('renders the privacy page with the simplified home nav', async ({ page }) => {
    await page.goto('/privacy');

    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
    await expect(page.locator('.page-updated')).toContainText('Updated:');
    await expect(page.locator('[data-site-nav] .nav-link')).toHaveCount(0);
    await expect(page.locator('[data-mobile-brand-text]')).toHaveText('buxx.me');
    await expect(page.locator('.page-content')).toContainText('This Privacy Policy explains how this website collects');

    const desktopBrandGap = await page.evaluate(() => {
      const logo = document.querySelector('.site-brand-logo');
      const brandText = document.querySelector('[data-mobile-brand-text]');

      if (!(logo instanceof HTMLElement) || !(brandText instanceof HTMLElement)) {
        return null;
      }

      return Math.round((brandText.getBoundingClientRect().left - logo.getBoundingClientRect().right) * 100) / 100;
    });

    expect(desktopBrandGap).toBe(6);
  });

  test('uses the home mobile navbar sizing on privacy without hiding the wordmark', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/privacy');

    const state = await page.evaluate(() => {
      const nav = document.querySelector('[data-site-nav]');
      const headerActions = document.querySelector('[data-header-actions]');
      const toggle = document.querySelector('[data-theme-toggle]');
      const brand = document.querySelector('[data-site-brand]');
      const brandText = document.querySelector('[data-mobile-brand-text]');
      const logo = document.querySelector('.site-brand-logo');

      if (
        !(nav instanceof HTMLElement) ||
        !(headerActions instanceof HTMLElement) ||
        !(toggle instanceof HTMLElement) ||
        !(brand instanceof HTMLElement) ||
        !(brandText instanceof HTMLElement) ||
        !(logo instanceof HTMLElement)
      ) {
        return null;
      }

      const navRect = nav.getBoundingClientRect();
      const brandRect = brand.getBoundingClientRect();
      const brandTextStyles = window.getComputedStyle(brandText);
      const toggleStyles = window.getComputedStyle(toggle);
      return {
        hasHomeHeaderActions: headerActions.classList.contains('global-header-actions--home'),
        hasPageNav: nav.classList.contains('site-nav--page'),
        hasHomeNav: nav.classList.contains('site-nav--home'),
        navHeight: navRect.height,
        brandCenterDelta: Math.abs((brandRect.top + brandRect.height / 2) - (navRect.top + navRect.height / 2)),
        brandGap: Math.round((brandText.getBoundingClientRect().left - logo.getBoundingClientRect().right) * 100) / 100,
        brandText: brandText.textContent,
        brandTextOpacity: brandTextStyles.opacity,
        brandTextWidth: brandText.getBoundingClientRect().width,
        toggleBackground: toggleStyles.backgroundColor,
        toggleBorder: toggleStyles.borderTopColor,
      };
    });

    expect(state).not.toBeNull();
    expect(state?.hasHomeHeaderActions).toBe(true);
    expect(state?.hasPageNav).toBe(true);
    expect(state?.hasHomeNav).toBe(false);
    expect(state?.navHeight).toBe(52);
    expect(state?.brandCenterDelta).toBeLessThanOrEqual(1);
    expect(state?.brandGap).toBe(6);
    expect(state?.brandText).toBe('buxx.me');
    expect(state?.brandTextOpacity).toBe('1');
    expect(state?.brandTextWidth).toBeGreaterThan(70);
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
