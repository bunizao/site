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
      '/blog/quiet-architecture?lang=zh',
    );
    await expect(links.filter({ hasText: 'English' })).toHaveAttribute(
      'href',
      '/blog/quiet-architecture?lang=en',
    );
  });
});
