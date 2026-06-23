import { expect, test } from './fixtures';

test.describe('Mood advanced surfaces', () => {
  test('renders tagged mood fixture states', async ({ page }) => {
    await page.goto('/mood?tag=e2e');

    await expect(page.locator('[data-mood-filter]')).toContainText('Filtered by');
    await expect(page.locator('[data-mood-filter]')).toContainText('#e2e');
    await expect(page.locator('.mood-item-tag').first()).toHaveText('#e2e');

    await page.goto('/mood?tag=unknown');

    await expect(page.locator('[data-mood-filter]')).toContainText('#unknown');
    await expect(page.getByText('No moods tagged #unknown.')).toBeVisible();
  });

  test('renders the sentiment timeline with gap buckets', async ({ page }) => {
    await page.goto('/mood/stats');

    await expect(page.getByRole('heading', { name: 'Mood curve' })).toBeVisible();
    await expect(page.locator('.sentiment-point')).toHaveCount(3);
    await expect(page.locator('.sentiment-point--gap')).toHaveCount(1);
    await expect(page.locator('.sentiment-point').nth(1)).toHaveAttribute('title', 'Jun 8: no scored posts');
  });

  test('renders mood portal model controls and fixture config update', async ({ page }) => {
    await page.goto('/dev/portal/mood-data');

    await expect(page.getByText('AI model')).toBeVisible();
    await expect(page.getByText('Primary')).toBeVisible();
    await expect(page.getByText('Fallback')).toBeVisible();
    await expect(page.getByText('Archive search')).toBeVisible();
    const primaryModel = page.getByLabel('Primary');
    const fallbackModel = page.getByLabel('Fallback');
    await expect(primaryModel).toBeEnabled();
    await expect(fallbackModel).toBeEnabled();
    await primaryModel.fill('custom/model-alpha');
    await fallbackModel.fill('custom/model-beta');
    await page.getByRole('button', { name: 'Test AI model config' }).click();
    await expect(page.getByText('custom/model-alpha: ok')).toBeVisible();

    const result = await page.evaluate(async () => {
      const response = await fetch('/v2/admin/mood/ai-config', {
        method: 'PUT',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          primary: 'custom/model-alpha',
          fallback: 'custom/model-beta',
        }),
      });
      return {
        status: response.status,
        body: await response.json(),
      };
    });

    expect(result).toEqual({
      status: 200,
      body: {
        primary: 'custom/model-alpha',
        fallback: 'custom/model-beta',
        updatedAt: '1970-01-01T00:00:00.000Z',
      },
    });
  });
});
