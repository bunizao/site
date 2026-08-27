import { expect, test } from '@playwright/test';

async function openConversationPlayground(page: import('@playwright/test').Page) {
  await page.goto('/components/conversation#playground');
  await page.locator('#conv-source').waitFor();
}

test.describe('component playgrounds', () => {
  test('conversation controls update a complete copyable source', async ({ page, context }) => {
    await openConversationPlayground(page);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    const source = page.locator('#conv-source');
    await expect(source).toHaveValue(/^```conversation\n@conversation avatars=on names=on\n/);

    await page.getByRole('switch', { name: 'Avatars' }).click();
    await expect(source).toHaveValue(/^```conversation\n@conversation avatars=off names=on\n/);

    await page.getByRole('switch', { name: 'Names' }).click();
    await expect(source).toHaveValue(/^```conversation\n@conversation avatars=off names=off\n/);
    await expect(page.locator('#playground .conv-thread')).toHaveAttribute('data-avatars', 'off');
    await expect(page.locator('#playground .conv-thread')).toHaveAttribute('data-names', 'off');

    await page.getByRole('button', { name: 'Copy complete conversation source' }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(
      await source.inputValue(),
    );
  });

  test('conversation source survives a page reload', async ({ page }) => {
    await openConversationPlayground(page);

    const source = page.locator('#conv-source');
    const edited = '```conversation\n@conversation avatars=off names=on\nme: saved draft\n```';
    await source.fill(edited);
    await page.reload();
    await page.locator('#conv-source').waitFor();

    await expect(source).toHaveValue(edited);
    await expect(page.getByRole('switch', { name: 'Avatars' })).not.toBeChecked();
    await expect(page.getByText('saved draft', { exact: true })).toBeVisible();
  });

  test('pages with playgrounds expose a colored link beside the introduction', async ({ page }) => {
    await page.goto('/components/decode-text');
    await expect(page.locator('.detail-playground-link')).toHaveAttribute('href', '#playground');
    await expect(page.locator('.detail-playground-link')).toHaveCSS('color', 'rgb(168, 79, 44)');

    await page.goto('/components/conversation');
    await expect(page.locator('.detail-playground-link')).toHaveAttribute('href', '#playground');

    await page.goto('/docs/writing/conversation');
    await expect(page.locator('.docs-playground-link')).toHaveAttribute(
      'href',
      '/components/conversation#playground',
    );
    await expect(page.locator('.docs-playground-link')).toHaveCSS('color', 'rgb(168, 79, 44)');
  });
});
