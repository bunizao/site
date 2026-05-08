import { expect, test } from './fixtures';

test.describe('Standalone pages', () => {
  test('renders the privacy page with the simplified home nav', async ({ page }) => {
    await page.goto('/privacy');

    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
    await expect(page.locator('.page-updated')).toContainText('April 28, 2026');
    await expect(page.locator('[data-site-nav] .nav-link')).toHaveCount(1);
    await expect(page.locator('[data-site-nav] .nav-link')).toHaveText('buxx.me');
    await expect(page.locator('.page-content')).toContainText('This Privacy Policy explains how this website collects');
  });

  test('redirects /mood/subscribe to /mood and auto-opens the notify panel', async ({ page }) => {
    await page.goto('/mood/subscribe');

    await expect(page).toHaveURL(/\/mood$/);
    await expect(page.locator('.notify-panel')).toHaveClass(/is-open/, { timeout: 30_000 });
    await expect(page.locator('[data-notify-email]')).toBeVisible();
  });
});
