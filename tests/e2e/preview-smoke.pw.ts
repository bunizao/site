import { expect, test } from './fixtures';

function requireBaseUrl(value: string | undefined): string {
  if (!value) {
    throw new Error('Playwright baseURL is required for preview smoke tests.');
  }

  return value.replace(/\/+$/, '');
}

test.describe('Preview smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('renders the mascot preview route', async ({ page }) => {
    await page.goto('/dev/preview');

    await expect(page.getByRole('heading', { name: 'Peek Preview' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Runtime Map' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Brand Behavior' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tracking Stage' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Added Expressions' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'confused' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'idle at rest, dart on hover' })).toBeVisible();
  });

  test('renders the newsletter preview route', async ({ page }) => {
    await page.goto('/dev/preview?view=newsletter');

    await expect(page.getByRole('heading', { name: 'Newsletter Preview' })).toBeVisible();
    await expect(page.getByText('Subscribe Confirm')).toBeVisible();
  });

  test('renders the home page shell', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('[data-hero-name]')).toBeVisible();
    await expect(page.locator('#projects-section')).toBeVisible();
    await expect(page.locator('#writing-section')).toBeVisible();
    await expect(page.locator('#moods-section')).toBeVisible();
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

  test('serves core API endpoints', async ({ request }, testInfo) => {
    const baseURL = requireBaseUrl(testInfo.project.use.baseURL as string | undefined);

    const moods = await request.get('/api/moods');
    expect(moods.ok()).toBeTruthy();
    expect(moods.headers()['content-type']).toContain('application/json');

    const moodsPayload = (await moods.json()) as {
      posts?: unknown[];
      channel?: Record<string, unknown>;
    };
    expect(Array.isArray(moodsPayload.posts)).toBe(true);
    if (moodsPayload.channel) {
      expect(typeof moodsPayload.channel).toBe('object');
    }

    const oembed = await request.get(`/api/oembed.json?url=${encodeURIComponent(`${baseURL}/mood`)}`);
    expect(oembed.ok()).toBeTruthy();
    expect(oembed.headers()['content-type']).toContain('application/json');

    const oembedPayload = (await oembed.json()) as {
      type?: string;
      html?: string;
    };
    expect(oembedPayload.type).toBe('rich');
    expect(oembedPayload.html).toContain('<iframe');

    const rss = await request.get('/mood/rss.xml');
    expect(rss.ok()).toBeTruthy();
    expect(rss.headers()['content-type']).toContain('application/rss+xml');

    const svg = await request.get('/api/status.svg?theme=light');
    expect(svg.ok()).toBeTruthy();
    expect(svg.headers()['content-type']).toContain('image/svg+xml');
  });
});
