import { expect, test } from './fixtures';

test.describe('Preview smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('renders the home page shell', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('[data-hero-name]')).toBeVisible();
    await expect(page.locator('#projects-section')).toBeVisible();
    await expect(page.locator('#writing-section')).toBeVisible();
    await expect(page.locator('#moods-section')).toBeVisible();
  });

  test('renders the tag-card specimen with full-size cards', async ({ page }) => {
    await page.goto('/components');

    await expect(page.locator('[data-site-nav]')).toBeVisible();
    await expect(page.locator('[data-menu-trigger]')).toBeVisible();
    await expect(page.locator('footer.footer')).toBeVisible();
    await expect(page.locator('.components-topbar')).toHaveCount(0);
    const cards = page.locator('.tagspec .tag-card');
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toBeVisible();
    await expect
      .poll(async () => (await cards.first().boundingBox())?.height ?? 0)
      .toBeGreaterThan(240);
    await expect(cards.first()).toHaveCSS('clip-path', 'inset(0px round 20px)');

    const themeDropdown = page.locator('[data-theme-dropdown]');
    const themeToggle = page.locator('[data-theme-toggle]');
    await themeDropdown.hover();
    await page.locator('[data-theme-option="light"]').click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    const moodFrame = page.locator('iframe[title="Mood wheel"]');
    const readingFrame = page.locator('iframe[title="Mobile reading bar"]');
    await expect(moodFrame).toBeVisible();
    await expect(readingFrame).toBeVisible();
    await expect(moodFrame.contentFrame().locator('html')).not.toHaveClass(/dark/);
    await expect(readingFrame.contentFrame().locator('html')).not.toHaveClass(/dark/);
    await themeToggle.click();
    await expect(page.locator('[data-theme-option="dark"]')).toBeVisible();
    await page.locator('[data-theme-option="dark"]').click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(moodFrame.contentFrame().locator('html')).toHaveClass(/dark/);
    await expect(readingFrame.contentFrame().locator('html')).toHaveClass(/dark/);
  });

  test('renders the mood feed shell', async ({ page }) => {
    await page.goto('/mood');

    await expect(page).toHaveTitle(/Moods/i);
    await expect(page.locator('[data-mood-hero]')).toBeVisible();
    await expect
      .poll(
        async () => {
          if (await page.locator('[data-mood-loading]').isVisible()) return 'loading';
          if (await page.locator('[data-mood-feed]').isVisible()) return 'feed';
          if (await page.locator('[data-mood-error]').isVisible()) return 'error';
          return 'pending';
        },
        { timeout: 30_000 }
      )
      .toMatch(/loading|feed|error/);
  });

  test('renders the blog shell and static feed routes', async ({ page, request }) => {
    await page.goto('/blog');

    await expect(page.locator('.blog-shell')).toBeVisible();
    await expect(page.locator('.blog-masthead__wordmark')).toBeVisible();
    await expect(page.locator('[data-site-wordmark-variant="blog"]')).toBeVisible();
    await expect(page.locator('.blog-colophon')).toHaveCount(0);
    await expect(page.locator('.sillage-sea')).toBeVisible();
    await expect(page.locator('.blog-row__link').first()).toBeVisible();

    const rss = await request.get('/blog/rss.xml');
    expect(rss.ok()).toBeTruthy();
    expect(rss.headers()['content-type']).toContain('application/rss+xml');
    expect(await rss.text()).toContain('<link>https://buxx.me/blog</link>');

    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.ok()).toBeTruthy();
    expect(sitemap.headers()['content-type']).toContain('application/xml');
    expect(await sitemap.text()).toContain('<loc>https://buxx.me/blog</loc>');
  });

  test('redirects the dev root to the admin portal', async ({ request }) => {
    const response = await request.get('/dev', { maxRedirects: 0 });

    expect(response.status()).toBe(302);
    expect(response.headers().location).toBe('/dev/portal');
  });

  test('redirects direct private API URLs through the public API prefix', async ({ request }) => {
    const response = await request.get('/v2/admin/auth/start?next=%2Fdev%2Fportal', {
      maxRedirects: 0,
    });

    expect(response.status()).toBe(308);
    const location = new URL(response.headers().location ?? '', response.url());
    expect(`${location.pathname}${location.search}`).toBe('/api/v2/admin/auth/start?next=%2Fdev%2Fportal');
  });

  test('shows the requested URI on the 404 page', async ({ page }) => {
    await page.goto('/missing-from-preview?source=e2e#section');

    await expect(page.locator('[data-nf-path-url]')).toHaveText('/missing-from-preview?source=e2e#section');
  });
});
