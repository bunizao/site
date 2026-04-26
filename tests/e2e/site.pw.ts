import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

function isIgnorableDevConsoleError(message: string): boolean {
  return message.includes('Outdated Optimize Dep');
}

async function waitForHomeMoodState(page: Page): Promise<void> {
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
}

function createListeningPayload(overrides: Record<string, unknown>) {
  return {
    configured: true,
    source: 'lastfm',
    track: {
      id: 'e2e-listening',
      title: 'All of the Lights',
      artist: 'Kanye West',
      collection: 'My Beautiful Dark Twisted Fantasy',
      appleMusicUrl: 'https://music.apple.com/test',
      artworkUrl: '/avatar.webp',
      thumbUrl: '/avatar.webp',
      previewUrl: '',
      year: '2010',
      genre: 'Hip-Hop/Rap',
      releaseKind: 'album',
      trackNumber: '5',
      trackCount: '13',
      sourceUrl: 'https://www.last.fm/music/Kanye+West/_/All+of+the+Lights',
      isNowPlaying: true,
      playedAt: '',
      ...overrides,
    },
  };
}

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

  const mixedHomeMoodPayload = {
    posts: [
      {
        id: '1001',
        datetime: '2026-02-10T12:00:00+00:00',
        previewText: 'Short preview',
        previewHtml: 'Short preview',
        image: null,
        mediaHtml: '',
        needsDetailPage: true,
        reactions: [],
        commentsCount: 0,
      },
      {
        id: '1002',
        datetime: '2026-02-10T12:10:00+00:00',
        previewText:
          'This longer preview is meant to wrap into a second reserved line so the home mood prototype can prove the cards do not all collapse into the same shape.',
        previewHtml:
          'This longer preview is meant to wrap into a second reserved line so the home mood prototype can prove the cards do not all collapse into the same shape.',
        image: null,
        mediaHtml: '',
        needsDetailPage: true,
        reactions: [],
        commentsCount: 0,
      },
      {
        id: '1003',
        datetime: '2026-02-10T12:20:00+00:00',
        tag: 'photo',
        previewText:
          'A medium preview with a thumbnail keeps the text reservation path honest when metadata follows the preview block.',
        previewHtml:
          'A medium preview with a thumbnail keeps the text reservation path honest when metadata follows the preview block.',
        image: '/avatar.webp',
        imageFallback: null,
        mediaHtml: '',
        needsDetailPage: true,
        reactions: [],
        commentsCount: 0,
      },
    ],
    channel: homeMoodPayload.channel,
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
    await expect(page.locator('#projects-section .project-item')).toHaveCount(2);
    await expect(page.locator('#writing-section .post-item')).toHaveCount(2);
    await expect(page.getByRole('link', { name: 'View all on GitHub' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Read all posts' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Privacy' })).toBeVisible();

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

  test('does not inline stale listening data or server islands into the home HTML', async ({ page }) => {
    const response = await page.request.get('/');
    expect(response.ok()).toBeTruthy();

    const html = await response.text();
    expect(html).not.toContain('_server-islands/Listening');
    expect(html).not.toContain('Mr. Rager');
    expect(html).not.toContain('data-track-title="Mr. Rager"');
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

    await waitForHomeMoodState(page);

    await expect(page.locator('#moods-section [data-mood-error]')).toBeHidden();

    await page.getByRole('link', { name: 'View all moods' }).click();
    await expect(page).toHaveURL(/\/mood$/);
  });

  test('reserves mixed home mood preview heights without runtime errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && !isIgnorableDevConsoleError(message.text())) {
        consoleErrors.push(message.text());
      }
    });

    await page.route('**/github-contributions-api.jogruber.de/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total: { lastYear: 5 },
          contributions: [],
        }),
      });
    });

    await page.route('**/api/moods', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mixedHomeMoodPayload),
      });
    });

    await page.goto('/');
    await page.locator('#moods-section').scrollIntoViewIfNeeded();

    await waitForHomeMoodState(page);

    const cards = page.locator('#moods-section .mood-card');
    await expect(cards).toHaveCount(3);
    await expect(page.locator('#moods-section [data-mood-error]')).toBeHidden();

    const reservedLines = await cards.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-reserved-lines'))
    );
    expect(reservedLines.filter((value) => value === '1').length).toBeGreaterThan(0);
    expect(reservedLines.filter((value) => value === '2').length).toBeGreaterThan(0);

    const reservedHeights = await cards.evaluateAll((nodes) =>
      nodes.map((node) => window.getComputedStyle(node).minHeight)
    );
    expect(new Set(reservedHeights).size).toBeGreaterThan(1);

    await cards.nth(1).click();
    await expect(page).toHaveURL(/\/mood\/1002$/);
    expect(consoleErrors).toEqual([]);
  });

  test('loads GitHub contributions and shows tooltip details', async ({ page }) => {
    await page.route('**/github-contributions-api.jogruber.de/**', async (route) => {
      const contributions = Array.from({ length: 30 }, (_, index) => ({
        date: `2026-02-${String(index + 1).padStart(2, '0')}`,
        count: (index % 5) + 1,
        level: 1,
      }));

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total: { lastYear: 321 },
          contributions,
        }),
      });
    });

    await page.goto('/');

    const section = page.locator('[data-contributions]');
    await expect(section).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 });
    await expect(page.locator('[data-total]')).toContainText('321');

    const bars = page.locator('[data-bar]');
    await expect(bars).toHaveCount(30);
    await bars.nth(10).dispatchEvent('mousemove');

    const tooltip = page.locator('[data-tooltip]');
    await expect(tooltip).toHaveClass(/is-visible/);
    await expect(page.locator('[data-tooltip-count]')).toContainText('contribution');
    await expect(page.locator('[data-tooltip-date]')).not.toHaveText('');
  });

  test('keeps listening metadata responsive for short and long tracks', async ({ page }) => {
    let listeningPayload = createListeningPayload({});

    await page.route('**/api/listening', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(listeningPayload),
      });
    });

    await page.setViewportSize({ width: 741, height: 957 });
    await page.goto('/');

    const track = page.locator('[data-listening-link]');
    const title = page.locator('[data-listening-title]');
    const artist = page.locator('[data-listening-artist]');

    await expect(page.locator('[data-listening-title-label]')).toHaveText('All of the Lights');
    await expect(track).toHaveClass(/is-inline/);
    await expect(title).not.toHaveClass(/is-marquee/);

    listeningPayload = createListeningPayload({
      title: 'Monster (feat. JAŸ-Z, Rick Ross, Nicki Minaj & Bon Iver)',
      artist: 'Kanye West, JAŸ-Z, Rick Ross, Nicki Minaj & Bon Iver',
      collection: 'My Beautiful Dark Twisted Fantasy (Deluxe Edition)',
    });

    await page.reload();

    await expect(page.locator('[data-listening-title-label]')).toHaveText(
      'Monster (feat. JAŸ-Z, Rick Ross, Nicki Minaj & Bon Iver)'
    );
    await expect(track).not.toHaveClass(/is-inline/);
    await expect(title).toHaveClass(/is-marquee/);

    const longLayout = await page.evaluate(() => {
      const trackNode = document.querySelector('[data-listening-link]');
      const artistNode = document.querySelector('[data-listening-artist]');
      const root = document.documentElement;

      if (!(trackNode instanceof HTMLElement) || !(artistNode instanceof HTMLElement)) {
        return null;
      }

      return {
        artistWidth: artistNode.getBoundingClientRect().width,
        artistScrollWidth: artistNode.scrollWidth,
        trackWidth: trackNode.getBoundingClientRect().width,
        documentWidth: root.scrollWidth,
        viewportWidth: root.clientWidth,
      };
    });

    expect(longLayout).not.toBeNull();
    expect(longLayout?.artistScrollWidth).toBeGreaterThan(longLayout?.artistWidth ?? 0);
    expect(longLayout?.artistWidth).toBeLessThanOrEqual((longLayout?.trackWidth ?? 0) + 1);
    expect(longLayout?.documentWidth).toBeLessThanOrEqual(longLayout?.viewportWidth ?? 0);
  });

  test('shows the listening wave while a recent track preview plays', async ({ page }) => {
    await page.addInitScript(() => {
      class FakeAudio extends EventTarget {
        paused = true;
        currentTime = 0;
        preload = '';
        src: string;

        constructor(src: string) {
          super();
          this.src = src;
        }

        async play() {
          this.paused = false;
        }

        pause() {
          this.paused = true;
        }
      }

      Object.defineProperty(window, 'Audio', {
        configurable: true,
        writable: true,
        value: FakeAudio,
      });
    });

    await page.route('**/api/listening', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(createListeningPayload({
          isNowPlaying: false,
          previewUrl: 'https://example.com/preview.m4a',
        })),
      });
    });

    await page.goto('/');

    const root = page.locator('[data-listening]');
    const playButton = page.locator('[data-listening-play]');
    await expect(page.locator('[data-listening-status]')).toHaveText('Recently Played');

    await playButton.click();
    await expect(root).toHaveClass(/is-preview-playing/);
    await expect(playButton).toHaveClass(/is-preview-playing/);

    const waveWidth = await page.locator('.listening-eyebrow-wave').evaluate((node) => {
      return Number.parseFloat(window.getComputedStyle(node).width);
    });
    expect(waveWidth).toBeGreaterThan(0);
  });

  test('shows the GitHub contributions fallback state when the request fails', async ({ page }) => {
    await page.route('**/github-contributions-api.jogruber.de/**', async (route) => {
      await route.abort('failed');
    });

    await page.goto('/');

    const section = page.locator('[data-contributions]');
    await expect(section).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 });
    await expect(section).toHaveClass(/is-error/);
    await expect(page.locator('[data-total]')).toContainText('Contributions unavailable');
  });

  test('shows the empty state when the preview feed has no moods', async ({ page }) => {
    await page.route('**/api/moods', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          posts: [],
          channel: homeMoodPayload.channel,
        }),
      });
    });

    await page.goto('/');
    await page.locator('#moods-section').scrollIntoViewIfNeeded();

    await expect(page.locator('#moods-section [data-mood-empty]')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#moods-section [data-mood-error]')).toBeHidden();
    await expect(page.locator('#moods-section .mood-item:not(.mood-item-skeleton)')).toHaveCount(0);
  });

  test('shows the error state when the preview feed request fails', async ({ page }) => {
    await page.route('**/api/moods', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'test failure' }),
      });
    });

    await page.goto('/');
    await page.locator('#moods-section').scrollIntoViewIfNeeded();

    await expect(page.locator('#moods-section [data-mood-error]')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#moods-section [data-mood-empty]')).toBeHidden();
    await expect(page.locator('#moods-section .mood-item:not(.mood-item-skeleton)')).toHaveCount(0);
  });
});
