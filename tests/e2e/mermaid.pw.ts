import { expect, test } from './fixtures';

test.describe('Mermaid diagrams', () => {
  test('keeps source code hidden while the client renderer loads', async ({ page }) => {
    await page.route('**/src/features/content/client/mermaid.ts*', (route) => route.abort());

    const response = await page.goto('/docs/platform/telegram', { waitUntil: 'domcontentloaded' });

    expect(response?.ok()).toBeTruthy();

    const diagram = page.locator('[data-mermaid-diagram]').first();
    await expect(diagram).toBeVisible();
    await expect(diagram.locator('[data-mermaid-source]')).toBeHidden();
  });

  test('renders the diagram into an SVG', async ({ page }) => {
    const response = await page.goto('/docs/platform/telegram');

    expect(response?.ok()).toBeTruthy();

    const diagram = page.locator('[data-mermaid-diagram]').first();
    await expect(diagram).toHaveAttribute('data-mermaid-state', 'rendered');
    await expect(diagram.locator('[data-mermaid-canvas] svg')).toBeVisible();
    await expect(diagram.locator('[data-mermaid-source]')).toBeHidden();
  });

  test('shows the source fallback without JavaScript', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    try {
      const response = await page.goto('/docs/platform/telegram');

      expect(response?.ok()).toBeTruthy();

      const diagram = page.locator('[data-mermaid-diagram]').first();
      await expect(diagram.locator('[data-mermaid-canvas]')).toBeHidden();
      await expect(diagram.locator('[data-mermaid-source]')).toBeVisible();
      await expect(diagram.locator('[data-mermaid-source]')).toContainText('flowchart TD');
    } finally {
      await context.close();
    }
  });
});
