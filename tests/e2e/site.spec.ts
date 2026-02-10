import { expect, test } from '@playwright/test';

test.describe('Home page', () => {
  const homeMoodPayload = {
    posts: [
      {
        id: '1001',
        datetime: '2026-02-10T12:00:00+00:00',
        previewText: 'E2E home mood item',
        previewHtml: 'E2E home mood item',
        image: null,
        mediaHtml: '',
        needsDetailPage: true,
        reactions: [],
        commentsCount: 0,
      },
    ],
    channel: {
      slug: 'e2e',
      title: 'E2E Channel',
    },
  };

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('renders core sections and persists selected theme', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/Bunizao's Website/i);
    await expect(page.locator('[data-hero-name]')).toBeVisible();
    await expect(page.locator('#projects-section')).toBeVisible();
    await expect(page.locator('#writing-section')).toBeVisible();
    await expect(page.locator('#moods-section')).toBeVisible();

    const themeDropdown = page.locator('[data-theme-dropdown]');
    await themeDropdown.hover();
    const darkOption = page.locator('[data-theme-option="dark"]');
    await expect(darkOption).toBeVisible();
    await darkOption.click();

    await expect
      .poll(async () => {
        return await page.locator('html').evaluate((node) => node.classList.contains('dark'));
      })
      .toBe(true);

    await page.reload();

    await expect
      .poll(async () => {
        return await page.locator('html').evaluate((node) => node.classList.contains('dark'));
      })
      .toBe(true);
  });

  test('loads mood preview and navigates to /mood', async ({ page }) => {
    await page.route('**/api/moods', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(homeMoodPayload),
      });
    });

    await page.goto('/');
    await page.locator('#moods-section').scrollIntoViewIfNeeded();

    await expect
      .poll(
        async () => {
          const items = await page.locator('#moods-section .mood-item:not(.mood-item-skeleton)').count();
          if (items > 0) return 'items';

          if (await page.locator('#moods-section [data-mood-empty]').isVisible()) return 'empty';
          if (await page.locator('#moods-section [data-mood-error]').isVisible()) return 'error';

          return 'loading';
        },
        { timeout: 30_000 }
      )
      .toMatch(/items|empty|error/);

    await expect(page.locator('#moods-section [data-mood-error]')).toBeHidden();

    await page.getByRole('link', { name: 'View all moods' }).click();
    await expect(page).toHaveURL(/\/mood$/);
  });
});
