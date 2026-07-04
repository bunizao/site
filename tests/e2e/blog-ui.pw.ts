import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

function isIgnorableDevConsoleError(message: string): boolean {
  return message.includes('Outdated Optimize Dep') || message.startsWith('Failed to load resource:');
}

async function installFakeAudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    class FakeAudio extends EventTarget {
      paused = true;
      currentTime = 0;
      duration = 30;
      preload = '';
      src = '';

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
}

async function firstBlogPostHref(page: Page): Promise<string> {
  await page.goto('/blog', { waitUntil: 'domcontentloaded' });

  const firstPost = page.locator('.blog-row__link').first();
  await expect(firstPost).toBeVisible();

  const href = await firstPost.getAttribute('href');
  expect(href).toMatch(/^\/blog\/[^/]+\/$/);

  return href as string;
}

async function findBlogMusicPostHref(page: Page): Promise<string | null> {
  await page.goto('/blog', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.blog-row__link').first()).toBeVisible();

  const hrefs = await page.locator('.blog-row__link').evaluateAll((links) =>
    links
      .map((link) => link.getAttribute('href'))
      .filter((href): href is string => Boolean(href?.startsWith('/blog/')))
  );

  for (const href of hrefs.slice(0, 12)) {
    await page.goto(href, { waitUntil: 'domcontentloaded' });
    if (await page.locator('[data-blog-music]').count() > 0) {
      return href;
    }
  }

  return null;
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const maxScrollWidth = Math.max(doc.scrollWidth, body.scrollWidth);
    const viewportWidth = doc.clientWidth;
    const offenders = Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          tag: node.tagName.toLowerCase(),
          className: node.className.toString(),
          left: Math.floor(rect.left),
          right: Math.ceil(rect.right),
          width: Math.ceil(rect.width),
        };
      })
      .filter((rect) => rect.width > 0 && (rect.left < -1 || rect.right > viewportWidth + 1))
      .slice(0, 5);

    return { maxScrollWidth, viewportWidth, offenders };
  });

  expect(
    overflow.maxScrollWidth,
    JSON.stringify(overflow.offenders, null, 2),
  ).toBeLessThanOrEqual(overflow.viewportWidth + 1);
}

test.describe('Blog reading UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('renders the masthead with profile-backed contact links and usable discovery controls', async ({ page }) => {
    await page.goto('/blog', { waitUntil: 'domcontentloaded' });

    const masthead = page.locator('.blog-masthead');
    await expect(masthead).toBeVisible();
    await expect(masthead.getByRole('heading', { name: '無人之境' })).toBeVisible();
    await expect(masthead).toContainText('生长于共鸣、独白、文学、与沉默之间。');

    await masthead.getByRole('button', { name: '联系' }).click();
    const contactMenu = page.getByRole('menu', { name: '联系方式' });
    await expect(contactMenu).toBeVisible();
    await expect(contactMenu.getByRole('menuitem', { name: /GitHub\s+@bunizao/ })).toHaveAttribute('href', 'https://tuu.cat/gh');
    await expect(contactMenu.getByRole('menuitem', { name: /Email\s+me@buxx\.me/ })).toHaveAttribute('href', 'mailto:me@buxx.me');
    await expect(masthead).not.toContainText('Iris Zhang');
    await expect(masthead).not.toContainText('Sam Lin');

    const searchButton = page.getByRole('button', { name: 'Search posts' });
    await expect(searchButton).toBeVisible();
    await searchButton.click();
    const searchDialog = page.locator('[data-blog-search]');
    await expect(searchDialog).toBeVisible();
    await expect(searchDialog).toHaveAttribute('open', '');
    await page.keyboard.press('Escape');
    await expect(searchDialog).not.toBeVisible();

    const yearLinks = page.locator('nav[aria-label="Jump to year"] a[href^="#y"]');
    const yearLinkCount = await yearLinks.count();
    if (yearLinkCount > 0) {
      const firstYear = yearLinks.first();
      const targetId = (await firstYear.getAttribute('href'))?.slice(1);
      expect(targetId).toBeTruthy();

      await expect(firstYear).toBeVisible();
      await firstYear.click();

      await expect(page).toHaveURL(new RegExp(`#${targetId}$`));
      await expect(page.locator(`#${targetId}`)).toBeInViewport();
    } else {
      await expect(page.locator('.blog-year__heading').first()).toHaveText(/^(?:\d{4}|Unknown)$/);
      await expect(page.locator('.blog-year').first()).toBeVisible();
    }
  });

  test('keeps article typography and TOC behavior coherent', async ({ page }) => {
    const href = await firstBlogPostHref(page);
    await page.setViewportSize({ width: 1440, height: 920 });
    await page.goto(href, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('.blog-article__title')).toBeVisible();
    const prose = page.locator('.blog-prose');
    await expect(prose).toBeVisible();
    await expect(prose.locator('p').first()).toBeVisible();

    const type = await prose.evaluate((node) => {
      const styles = window.getComputedStyle(node);
      return {
        fontSize: Number.parseFloat(styles.fontSize),
        lineHeight: Number.parseFloat(styles.lineHeight),
        color: styles.color,
      };
    });
    expect(type.fontSize).toBeGreaterThanOrEqual(16);
    expect(type.lineHeight / type.fontSize).toBeGreaterThan(1.6);
    expect(type.color).not.toBe('rgba(0, 0, 0, 0)');

    const headingCount = await prose.locator('h2, h3').count();
    const topbar = page.locator('.toc-topbar');
    await expect(topbar).not.toHaveAttribute('hidden', '');

    const hasNoToc = (await topbar.getAttribute('data-no-toc')) === 'true';
    const toc = page.locator('.toc-container');

    if (!hasNoToc && headingCount >= 2) {
      await expect(toc).not.toHaveAttribute('hidden', '');
      await expect(toc.locator('.toc-link').first()).toBeVisible();
      expect(await toc.locator('.toc-link').count()).toBeGreaterThanOrEqual(2);
    } else {
      await expect(toc).toHaveAttribute('hidden', '');
      await expect(page.locator('.toc-topbar--static')).toHaveCount(1);
    }
  });

  test('does not create horizontal overflow on mobile blog routes', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const href = await firstBlogPostHref(page);

    await page.goto('/blog', { waitUntil: 'domcontentloaded' });
    await expectNoHorizontalOverflow(page);

    await page.goto(href, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.blog-article__title')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('renders Apple Music cards and plays the preview without MusicKit', async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    let tokenRequests = 0;

    page.on('console', (message) => {
      if (message.type() === 'error' && !isIgnorableDevConsoleError(message.text())) {
        consoleErrors.push(message.text());
      }
    });
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    await installFakeAudio(page);

    await page.route('**/api/v2/musickit/token', async (route) => {
      tokenRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    const href = await findBlogMusicPostHref(page);
    test.skip(!href, 'No Apple Music card is available in the current blog fixture.');

    await page.goto(href as string, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('iframe[src*="embed.music.apple.com"]')).toHaveCount(0);

    const card = page.locator('[data-blog-music]').first();
    const playButton = card.locator('[data-blog-music-play]');
    await expect(card).toBeVisible();
    await expect(playButton).toHaveAttribute('data-apple-catalog-id', /^\d+$/);
    await expect(playButton).toHaveAttribute('data-preview-url', /e2e-apple-preview-\d+\.m4a$/);
    await expect(card.locator('[data-blog-music-title]')).not.toHaveText('');
    await expect(card.locator('.blog-music__meta')).toContainText('E2E Artist');
    await expect(card.locator('[data-blog-music-progress]')).toHaveAttribute('role', 'slider');
    await expect(card.locator('[data-blog-music-elapsed]')).toHaveText('0:00');

    await playButton.click();
    await expect(card).toHaveClass(/is-playing/);
    await expect(card).toHaveClass(/is-source-preview/);
    await expect(card).not.toHaveClass(/is-source-full/);
    expect(tokenRequests).toBe(0);

    expect({ consoleErrors, pageErrors }).toEqual({
      consoleErrors: [],
      pageErrors: [],
    });
  });

  test('plays previews without loading MusicKit when the page defines a process shim', async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    let tokenRequests = 0;
    let sdkRequests = 0;

    page.on('console', (message) => {
      if (message.type() === 'error' && !isIgnorableDevConsoleError(message.text())) {
        consoleErrors.push(message.text());
      }
    });
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    await page.addInitScript(() => {
      window.process = { env: {} } as typeof window.process;
    });
    await installFakeAudio(page);

    await page.route('**/api/v2/musickit/token', async (route) => {
      tokenRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'test.developer.token',
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        }),
      });
    });

    await page.route('https://js-cdn.music.apple.com/musickit/v3/musickit.js', async (route) => {
      sdkRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `
          if (globalThis.process?.versions === undefined) {
            throw new Error('MusicKit saw an unsafe process shim');
          }
          globalThis.MusicKit = {
            Events: {
              playbackStateDidChange: 'playbackStateDidChange',
              playbackTimeDidChange: 'playbackTimeDidChange',
              playbackDurationDidChange: 'playbackDurationDidChange'
            },
            PlaybackStates: { playing: 2 },
            async configure() {
              const listeners = new Map();
              const instance = {
                isAuthorized: false,
                playbackState: 0,
                currentPlaybackTime: 0,
                currentPlaybackDuration: 245,
                async authorize() {
                  this.isAuthorized = true;
                  return 'user-token';
                },
                async setQueue(descriptor) {
                  globalThis.__musicKitQueue = descriptor;
                },
                async play() {
                  this.playbackState = 2;
                  listeners.get('playbackStateDidChange')?.forEach((handler) => handler({}));
                },
                async pause() {
                  this.playbackState = 3;
                },
                async stop() {
                  this.playbackState = 0;
                },
                async seekToTime(seconds) {
                  this.currentPlaybackTime = seconds;
                },
                addEventListener(name, handler) {
                  const handlers = listeners.get(name) ?? [];
                  handlers.push(handler);
                  listeners.set(name, handlers);
                },
                removeEventListener() {}
              };
              globalThis.__musicKitInstance = instance;
              return instance;
            },
            getInstance() {
              return globalThis.__musicKitInstance;
            }
          };
        `,
      });
    });

    const href = await findBlogMusicPostHref(page);
    test.skip(!href, 'No Apple Music card is available in the current blog fixture.');

    await page.goto(href as string, { waitUntil: 'domcontentloaded' });

    const card = page.locator('[data-blog-music]').first();
    const playButton = card.locator('[data-blog-music-play]');
    const catalogId = await playButton.getAttribute('data-apple-catalog-id');
    expect(catalogId).toMatch(/^\d+$/);

    await playButton.click();
    await expect(card).toHaveClass(/is-playing/);
    await expect(card).toHaveClass(/is-source-preview/);
    await expect(card).not.toHaveClass(/is-source-full/);
    expect(tokenRequests).toBe(0);
    expect(sdkRequests).toBe(0);

    expect({ consoleErrors, pageErrors }).toEqual({
      consoleErrors: [],
      pageErrors: [],
    });
  });

  test('opens the subscribe panel with email, channel, and RSS controls', async ({ page }) => {
    let payload: Record<string, unknown> | null = null;

    await page.route('**/api/notify/subscribe', async (route) => {
      payload = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'confirm_sent' }),
      });
    });

    await page.goto('/blog');

    const trigger = page.locator('[data-subscribe-toggle="blog"]');
    await expect(trigger).toBeVisible();
    await trigger.focus();
    await page.keyboard.press('Enter');

    const panel = page.locator('[data-subscribe-panel][data-subscribe-id="blog"]');
    await expect(panel).toHaveClass(/is-open/);
    await expect(panel).toHaveAttribute('aria-hidden', 'false');
    await expect(panel.getByPlaceholder('请留邮箱')).toBeVisible();

    const blogChannel = panel.locator('[data-sub-channel][value="blog"]');
    const moodChannel = panel.locator('[data-sub-channel][value="mood"]');
    await expect(blogChannel).toBeChecked();
    await expect(moodChannel).toBeChecked();
    await expect(panel.getByText('Posts')).toBeVisible();
    await expect(panel.getByText('Moods')).toBeVisible();
    await expect(panel.getByRole('link', { name: /RSS/ })).toHaveAttribute('href', '/blog/rss.xml');
    await expect(panel.locator('[data-sub-submit]')).toBeVisible();

    await panel.getByPlaceholder('请留邮箱').fill('reader@example.com');
    await panel.locator('[data-sub-submit]').click();

    await expect(panel.locator('[data-sub-success-text]')).toBeVisible();
    const submittedPayload = payload as unknown as Record<string, unknown>;
    expect(submittedPayload).toMatchObject({
      email: 'reader@example.com',
      channels: ['blog', 'mood'],
      deliveryMode: 'instant',
      turnstileToken: '',
    });
    expect(typeof submittedPayload.timezone).toBe('string');
  });
});
