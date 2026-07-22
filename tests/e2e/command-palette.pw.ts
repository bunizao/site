import { expect, test } from './fixtures';

// The palette fires two live backends on every query: Pagefind (Writing) and
// the mood FTS endpoint (Moods). Stub both by default so command/navigation
// assertions stay deterministic; individual tests override to exercise results.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/v2/mood/search*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ results: [] }),
    });
  });
  // No Pagefind index in the test server → import() rejects → Writing falls
  // back to substring-matching the recent-post list (empty unless a test seeds
  // palette.json). Aborting keeps that path fast and deterministic.
  await page.route('**/pagefind/pagefind.js', (route) => route.abort());
});

test.describe('Site command palette', () => {
  test('opens accessibly and shows recent Writing once', async ({ page }) => {
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

  test('filters commands and activates the top result', async ({ page }) => {
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

  test('searches Writing inline — no second dialog, no navigation', async ({ page }) => {
    // Stub the Pagefind programmatic module with one deterministic hit.
    await page.route('**/pagefind/pagefind.js', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/javascript',
        body: `
          export async function search() {
            return {
              results: [
                {
                  data: async () => ({
                    url: '/blog/deep-archive/',
                    meta: { title: 'Deep Archive Result' },
                    excerpt: 'a <mark>deep</mark> archive match',
                  }),
                },
              ],
            };
          }
        `,
      });
    });

    await page.goto('/privacy');
    await page.keyboard.press('Control+K');

    const palette = page.getByRole('dialog', { name: 'Site search and commands' });
    await palette.getByRole('combobox', { name: 'Search commands' }).fill('deep archive topic');

    const hit = palette.getByRole('option', { name: /Deep Archive Result/ });
    await expect(hit).toBeVisible();
    await expect(hit).toHaveAttribute('href', '/blog/deep-archive/');

    // Everything happens in place: no navigation, and only the one palette.
    await expect(page).toHaveURL(/\/privacy\/?$/);
    await expect(page.getByRole('dialog')).toHaveCount(1);
  });

  test('searches Moods inline with FTS snippets', async ({ page }) => {
    await page.route('**/palette.json', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ posts: [] }) }),
    );
    await page.route('**/api/v2/mood/search*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          results: [
            { id: '3641', datetime: '2026-07-01T10:00:00Z', snippet: 'a <mark>calm</mark> morning', tags: [] },
          ],
        }),
      });
    });

    await page.goto('/privacy');
    await page.keyboard.press('Control+K');

    const palette = page.getByRole('dialog', { name: 'Site search and commands' });
    await palette.getByRole('combobox', { name: 'Search commands' }).fill('calm');

    const moodHit = palette.getByRole('option', { name: /calm morning/ });
    await expect(moodHit).toBeVisible();
    // Mood hits land in the L1 feed anchored at the post, not the L2 detail page.
    await expect(moodHit).toHaveAttribute('href', '/mood?3641');
  });

  test('scopes search to Writing on the blog — no mood content', async ({ page }) => {
    await page.route('**/palette.json', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ posts: [] }) }),
    );
    // A Pagefind writing hit and a mood FTS hit with a distinctive snippet.
    await page.route('**/pagefind/pagefind.js', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/javascript',
        body: `
          export async function search() {
            return {
              results: [
                {
                  data: async () => ({
                    url: '/blog/scoped/',
                    meta: { title: 'Scoped Writing Hit' },
                    excerpt: 'a scoped writing match',
                  }),
                },
              ],
            };
          }
        `,
      });
    });
    await page.route('**/api/v2/mood/search*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          results: [{ id: '9001', datetime: '2026-07-01T10:00:00Z', snippet: 'an out-of-scope mood', tags: [] }],
        }),
      });
    });

    await page.goto('/blog');
    await page.keyboard.press('Control+K');
    const palette = page.getByRole('dialog', { name: 'Site search and commands' });
    await palette.getByRole('combobox', { name: 'Search commands' }).fill('scoped');

    await expect(palette.getByRole('option', { name: /Scoped Writing Hit/ })).toBeVisible();
    // Mood FTS is out of scope on /blog, so its content never renders even when
    // the endpoint would return a hit.
    await expect(palette.getByText('an out-of-scope mood')).toHaveCount(0);
  });

  test('folds subscribe into one action, not scattered RSS links', async ({ page }) => {
    await page.goto('/privacy');
    await page.keyboard.press('Control+K');
    const palette = page.getByRole('dialog', { name: 'Site search and commands' });

    await expect(palette.getByRole('option', { name: 'Subscribe' })).toBeVisible();
    await expect(palette.getByRole('option', { name: /RSS/ })).toHaveCount(0);
  });

  test('g-then-key jumps from the palette shortcut hints', async ({ page }) => {
    await page.goto('/privacy');
    await page.keyboard.press('Control+K');

    const palette = page.getByRole('dialog', { name: 'Site search and commands' });
    const input = palette.getByRole('combobox', { name: 'Search commands' });
    await expect(palette).toBeVisible();

    await page.keyboard.press('g');
    await page.keyboard.press('x');
    await expect(input).toHaveValue('g');
    await input.fill('');

    await page.keyboard.press('g');
    await page.waitForTimeout(1300);
    await expect(input).toHaveValue('g');
    await input.fill('');

    await page.keyboard.press('g');
    await page.keyboard.press('h');
    await expect(page).toHaveURL(/\/$/);
  });

  test('uses the site-wide palette on Writing routes', async ({ page }) => {
    await page.goto('/blog');

    const trigger = page.getByRole('button', { name: 'Search and commands' });
    const palette = page.getByRole('dialog', { name: 'Site search and commands' });

    await trigger.click();
    await expect(palette).toBeVisible();

    await page.keyboard.press('Control+K');
    await expect(palette).toBeHidden();
    await page.keyboard.press('Control+K');
    await expect(palette).toBeVisible();

    // No separate blog search dialog exists anymore — the palette is the only one.
    await expect(page.getByRole('dialog')).toHaveCount(1);

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
