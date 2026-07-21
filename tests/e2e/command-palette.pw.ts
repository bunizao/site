import { expect, test } from './fixtures';

test.describe('Site command palette', () => {
  test('opens accessibly and loads Writing results only once', async ({ page }) => {
    let paletteRequests = 0;

    await page.route('**/palette.json', async (route) => {
      paletteRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          posts: [{ title: 'A palette fixture post', path: '/blog/palette-fixture/' }],
        }),
      });
    });

    await page.goto('/privacy');

    const trigger = page.getByRole('button', { name: 'Search and commands' });
    const dialog = page.getByRole('dialog', { name: 'Site search and commands' });
    const input = dialog.getByRole('combobox', { name: 'Search commands' });

    await expect(trigger).toHaveAttribute('aria-controls', 'site-command-palette');
    expect(paletteRequests).toBe(0);

    await trigger.click();

    await expect(dialog).toBeVisible();
    await expect(input).toBeFocused();
    await expect(dialog.getByRole('option', { name: 'A palette fixture post' })).toBeVisible();
    expect(paletteRequests).toBe(1);

    await dialog.getByRole('button', { name: 'Close' }).click();
    await trigger.click();

    await expect(dialog.getByRole('option', { name: 'A palette fixture post' })).toBeVisible();
    expect(paletteRequests).toBe(1);
  });

  test('filters commands and activates the preferred local result', async ({ page }) => {
    await page.goto('/privacy');
    await page.keyboard.press('Control+K');

    const dialog = page.getByRole('dialog', { name: 'Site search and commands' });
    const input = dialog.getByRole('combobox', { name: 'Search commands' });
    const moods = dialog.getByRole('option', { name: 'Moods' });

    await input.fill('moods');
    await expect(moods).toBeVisible();
    await expect(moods).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/mood$/);
  });

  test('carries unmatched queries into the full Writing search', async ({ page }) => {
    await page.route('**/pagefind/pagefind-ui.js', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `
          window.PagefindUI = class {
            constructor(options) {
              const input = document.createElement('input');
              input.className = 'pagefind-ui__search-input';
              document.querySelector(options.element).appendChild(input);
            }
          };
        `,
      });
    });

    await page.goto('/privacy');
    await page.keyboard.press('Control+K');

    const palette = page.getByRole('dialog', { name: 'Site search and commands' });
    await palette.getByRole('combobox', { name: 'Search commands' }).fill('deep archive topic');

    const fullSearch = palette.getByRole('option', { name: 'Search all posts…' });
    await expect(fullSearch).toBeVisible();
    await expect(fullSearch).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter');

    const blogSearch = page.getByRole('dialog', { name: '搜索文章' });
    await expect(page).toHaveURL(/\/blog\/?$/);
    await expect(blogSearch).toBeVisible();
    await expect(blogSearch.locator('.pagefind-ui__search-input')).toHaveValue('deep archive topic');
  });

  test('uses the site-wide palette on Writing routes', async ({ page }) => {
    await page.goto('/blog');

    const trigger = page.getByRole('button', { name: 'Search and commands' });
    const palette = page.getByRole('dialog', { name: 'Site search and commands' });
    const blogSearch = page.getByRole('dialog', { name: '搜索文章' });

    await trigger.click();
    await expect(palette).toBeVisible();
    await expect(blogSearch).toBeHidden();

    await page.keyboard.press('Control+K');
    await expect(palette).toBeHidden();
    await page.keyboard.press('Control+K');
    await expect(palette).toBeVisible();
    await expect(blogSearch).toBeHidden();

    await palette.getByRole('combobox', { name: 'Search commands' }).fill('appearance');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('html')).toHaveAttribute('data-theme-setting', 'light');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('theme'))).toBe('light');
  });

  test('clears a query before Escape closes and restores trigger focus', async ({ page }) => {
    await page.goto('/privacy');

    const trigger = page.getByRole('button', { name: 'Search and commands' });
    const dialog = page.getByRole('dialog', { name: 'Site search and commands' });
    const input = dialog.getByRole('combobox', { name: 'Search commands' });

    await trigger.click();
    await input.fill('nothing local matches this');
    await page.keyboard.press('Escape');

    await expect(dialog).toBeVisible();
    await expect(input).toHaveValue('');

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('changes appearance from the keyboard', async ({ page }) => {
    await page.goto('/privacy');
    await page.keyboard.press('Control+K');

    const dialog = page.getByRole('dialog', { name: 'Site search and commands' });
    const input = dialog.getByRole('combobox', { name: 'Search commands' });
    const appearance = dialog.getByRole('option', { name: /Appearance/ });

    await input.fill('appearance');
    await expect(appearance).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-theme-setting', 'system');

    await page.keyboard.press('ArrowRight');
    await expect(page.locator('html')).toHaveAttribute('data-theme-setting', 'light');
    await expect(dialog.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');

    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('data-theme-setting', 'dark');
    await expect(dialog.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
  });
});
