import { expect, test } from './fixtures';

test.describe('Standalone pages', () => {
  test('serves negotiated markdown for home and privacy', async ({ request }) => {
    const home = await request.get('/', { headers: { Accept: 'text/markdown' } });
    expect(home.ok()).toBeTruthy();
    expect(home.headers()['content-type']).toContain('text/markdown');
    expect(home.headers()['x-markdown-tokens']).toBeTruthy();
    expect(await home.text()).toContain('[Blog](https://buxx.me/blog/)');

    const privacy = await request.get('/privacy', { headers: { Accept: 'text/markdown' } });
    expect(privacy.ok()).toBeTruthy();
    expect(privacy.headers()['content-type']).toContain('text/markdown');
    expect(await privacy.text()).toContain('# Privacy Policy');
  });

  test('renders the privacy page with the shared site footer and no navbar', async ({ page }) => {
    await page.goto('/privacy');

    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
    await expect(page.locator('.page-updated')).toContainText('Updated:');
    await expect(page.locator('[data-site-nav]')).toHaveCount(0);
    await expect(page.locator('footer.footer')).toBeVisible();
    await expect(page.locator('footer.footer').getByRole('navigation', { name: 'Footer' })).toBeVisible();
    await expect(page.locator('.page-content')).toContainText('This Privacy Policy explains how this website collects');
  });

  test('redirects /mood/subscribe to /mood and auto-opens the notify panel', async ({ page }) => {
    await page.goto('/mood/subscribe');

    await expect(page).toHaveURL(/\/mood$/);
    await expect(page.locator('.subscribe-panel')).toHaveClass(/is-open/, { timeout: 30_000 });
    await expect(page.locator('[data-sub-email]')).toBeVisible();
  });
});
