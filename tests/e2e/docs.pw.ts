import { expect, test } from './fixtures';

test.describe('Developer reference', () => {
  test('publishes the hub and article navigation', async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 900 });
    const response = await page.goto('/docs');

    expect(response?.ok()).toBeTruthy();
    await expect(page.getByRole('heading', { name: 'Everything this site does, written down.' })).toBeVisible();

    await page.getByRole('link', { name: 'API Overview', exact: true }).click();
    await expect(page).toHaveURL(/\/docs\/api\/overview$/);
    await expect(page.getByRole('heading', { level: 1, name: 'API Overview' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Docs', exact: true })).toBeVisible();
    await expect(page.locator('.docs-toc')).toBeVisible();
  });

  test('searches the full body and keeps command search docs-scoped', async ({ page }) => {
    await page.goto('/docs/overview');

    const dialog = page.locator('dialog[data-docs-search]');
    const input = dialog.getByRole('combobox', { name: 'Search documentation' });
    await page.getByRole('button', { name: 'Search docs' }).click();
    await expect(dialog).toBeVisible();
    await expect(input).toBeFocused();
    await expect(page.locator('#site-command-palette')).toBeHidden();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await page.keyboard.press('Control+K');
    await expect(dialog).toBeVisible();

    await input.fill('ten-post cache buckets');
    const architecture = dialog.getByRole('option', { name: /Architecture/ });
    await expect(architecture).toBeVisible();
    await expect(architecture).toHaveAttribute('href', '/docs/architecture');

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/docs\/architecture$/);
  });

  test('renders directive demos from their documented source', async ({ page }) => {
    await page.goto('/docs/writing/poem');

    await expect(page.locator('.docs-code-head').first()).toBeVisible();
    await expect(page.locator('.docs-demo').first()).toBeVisible();
    await expect(page.locator('.docs-demo-label').first()).toHaveText('Rendered');
    await expect(page.locator('.docs-demo-render').first()).toContainText('雨巷');
  });

  test('advertises and serves explicit Markdown URLs', async ({ page, request }) => {
    await page.goto('/docs/writing/poem');

    const alternate = page.locator('link[rel="alternate"][type="text/markdown"]');
    await expect(alternate).toHaveAttribute(
      'href',
      'https://buxx.me/docs/writing/poem/index.md',
    );

    const response = await request.get('/docs/writing/poem/index.md');
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['content-type']).toContain('text/markdown');
    expect(response.headers()['x-markdown-tokens']).toBeTruthy();
    expect(await response.text()).toContain('# Poems');
  });

  test('keeps the mobile article inside the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/docs/architecture');

    const nav = page.locator('[data-docs-nav]');
    await expect(nav.locator('.docs-nav-summary')).toBeVisible();
    await expect(nav).toHaveJSProperty('open', false);

    const width = await page.evaluate(() => ({
      content: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(width.content).toBeLessThanOrEqual(width.viewport + 1);
  });
});
