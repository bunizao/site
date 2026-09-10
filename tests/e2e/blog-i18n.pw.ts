import { expect, test } from './fixtures';

test.describe('blog i18n without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('keeps every published language reachable as a link', async ({ page }) => {
    await page.goto('/blog/quiet-architecture');

    await expect(page.locator('.blog-lang__pill')).toBeHidden();
    const links = page.locator('.blog-lang__noscript a');
    await expect(links).toHaveCount(2);
    await expect(links.filter({ hasText: '中文' })).toHaveAttribute(
      'href',
      '/blog/quiet-architecture',
    );
    await expect(links.filter({ hasText: 'English' })).toHaveAttribute(
      'href',
      '/blog/en/quiet-architecture',
    );
  });
});

test.describe('blog translation URLs', () => {
  test('serves the translation at its locale URL, self-canonical and cross-linked', async ({ page }) => {
    const response = await page.goto('/blog/en/quiet-architecture');
    expect(response?.status()).toBe(200);

    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://buxx.me/blog/en/quiet-architecture',
    );
    await expect(page.locator('link[rel="alternate"][hreflang="zh"]')).toHaveAttribute(
      'href',
      'https://buxx.me/blog/quiet-architecture',
    );
    await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute(
      'href',
      'https://buxx.me/blog/quiet-architecture',
    );
    await expect(page.locator('link[rel="alternate"][type="text/markdown"]')).toHaveAttribute(
      'href',
      'https://buxx.me/blog/en/quiet-architecture/index.md',
    );
  });

  // A translation's Ghost slug and the retired `?lang=` form are not addresses.
  test('answers the retired forms with one permanent redirect', async ({ request }) => {
    const ghostSlug = await request.get('/blog/on-quiet-architecture', { maxRedirects: 0 });
    expect(ghostSlug.status()).toBe(301);
    expect(ghostSlug.headers().location).toBe('/blog/en/quiet-architecture');

    const query = await request.get('/blog/quiet-architecture?lang=en&ref=tg', { maxRedirects: 0 });
    expect(query.status()).toBe(301);
    expect(query.headers().location).toBe('/blog/en/quiet-architecture?ref=tg');

    const defaultLocale = await request.get('/blog/quiet-architecture?lang=zh', { maxRedirects: 0 });
    expect(defaultLocale.status()).toBe(301);
    expect(defaultLocale.headers().location).toBe('/blog/quiet-architecture');

    const original = await request.get('/blog/quiet-architecture', { maxRedirects: 0 });
    expect(original.status()).toBe(200);
    expect(original.headers()['content-language']).toBeUndefined();
    expect(original.headers().vary ?? '').not.toContain('Accept-Language');
  });
});
