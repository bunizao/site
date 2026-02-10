import { expect, test } from '@playwright/test';
import { getLatestMoodId } from './helpers';

function createMoodFeedPayload(moodId: string) {
  return {
    posts: [
      {
        id: moodId,
        datetime: '2026-02-10T13:00:00+00:00',
        tag: 'e2e',
        previewText: 'E2E mood feed item',
        previewHtml: 'E2E mood feed item',
        image: null,
        mediaHtml: '',
        needsDetailPage: true,
        forwardedFrom: null,
        quote: null,
        reactions: [],
        commentsCount: 1,
      },
    ],
    channel: {
      slug: 'e2e',
      title: 'E2E Channel',
      description: 'E2E mood feed',
      avatar: '',
    },
  };
}

test.describe('Mood routes', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('loads mood feed and opens a detail page from the first item', async ({ page, request }) => {
    const latestMoodId = await getLatestMoodId(request);
    test.skip(!latestMoodId, 'No mood id available from /api/moods');

    const moodFeedPayload = createMoodFeedPayload(latestMoodId as string);
    await page.route('**/api/moods**', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('probe') === '1') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ latestId: latestMoodId }),
        });
        return;
      }

      if (url.searchParams.has('before')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ posts: [], channel: moodFeedPayload.channel }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(moodFeedPayload),
      });
    });

    await page.goto('/mood');

    await expect(page).toHaveTitle(/Moods/i);
    await expect(page.locator('[data-mood-hero]')).toBeVisible();
    await expect(page.locator('[data-mood-feed]')).not.toHaveClass(/is-hidden/, { timeout: 30_000 });

    const firstItem = page.locator('[data-mood-list] .mood-item').first();
    await expect(firstItem).toBeVisible();

    const rssAction = page.locator('[data-header-actions] a[href="/mood/rss.xml"]');
    await expect(rssAction).toBeVisible();

    await firstItem.hover();
    const expandLink = firstItem.locator('.mood-item-expand-float');
    await expect(expandLink).toBeVisible();

    const href = await expandLink.getAttribute('href');
    expect(href).toMatch(/^\/mood\/\d+$/);

    await expandLink.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
  });

  test('loads comments on detail page and fallback back-button navigation works', async ({ page, request }) => {
    const latestMoodId = await getLatestMoodId(request);
    test.skip(!latestMoodId, 'No mood id available from /api/moods');

    await page.route('**/api/comments?postId=*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          comments: [
            {
              id: '9001',
              author: 'E2E',
              authorAvatar: '',
              datetime: '2026-02-10T13:10:00+00:00',
              content: '<p>Test comment</p>',
              reactions: [],
            },
          ],
          hasMore: false,
          nextBefore: '',
        }),
      });
    });

    await page.goto('/mood', { waitUntil: 'domcontentloaded' });
    await page.goto(`/mood/${latestMoodId}`, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('[data-back-button]')).toBeVisible();
    await expect(page.locator('[data-comments-list]')).toBeVisible();

    await expect
      .poll(async () => {
        return await page.locator('[data-comments-loading]').count();
      }, { timeout: 30_000 })
      .toBe(0);

    await expect
      .poll(async () => {
        const commentsCount = await page.locator('[data-comments-list] .mood-comment').count();
        if (commentsCount > 0) return true;
        return await page.locator('[data-comments-empty]').isVisible();
      })
      .toBe(true);

    await page.locator('[data-back-button]').click();
    await expect(page).toHaveURL(/\/mood$/);
  });

  test('redirects /mood/:id?embed=1 to the embed endpoint with expected params', async ({ page }) => {
    const moodId = '12345';

    await page.goto(`/mood/${moodId}?embed=1&theme=dark`);

    const redirected = new URL(page.url());
    expect(redirected.pathname).toBe('/mood/embed');
    expect(redirected.searchParams.get('id')).toBe(moodId);
    expect(redirected.searchParams.get('theme')).toBe('dark');
    expect(redirected.searchParams.get('link')).toBe('false');
  });

  test('applies embed query options to root attributes', async ({ page }) => {
    await page.goto('/mood/embed?count=2&theme=dark&density=compact&font=system&frame=false&link=false');

    await expect(page.locator('html')).toHaveAttribute('data-embed-theme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-embed-density', 'compact');
    await expect(page.locator('html')).toHaveAttribute('data-embed-font', 'system');
    await expect(page.locator('html')).toHaveAttribute('data-embed-frame', 'false');

    await expect
      .poll(async () => {
        const cards = await page.locator('.embed-card').count();
        if (cards > 0) return true;
        return await page.locator('.empty-state').isVisible();
      })
      .toBe(true);
  });
});
