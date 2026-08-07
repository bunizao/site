import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const GHOST_PREVIEW_E2E_POST_ID = '5ddc9141c35e7700383b2937';

async function scrollPageTo(page: Page, top: number): Promise<void> {
  await page.locator('[data-page-scroller]').evaluate((scroller, nextTop) => {
    scroller.scrollTo({ top: nextTop, behavior: 'instant' });
  }, top);
}

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
        const root = globalThis as typeof globalThis & {
          __fakeAudioPlayCalls?: number;
          __fakeAudioMutedAtPlay?: boolean[];
        };
        root.__fakeAudioPlayCalls = (root.__fakeAudioPlayCalls ?? 0) + 1;
        root.__fakeAudioMutedAtPlay = [...(root.__fakeAudioMutedAtPlay ?? []), Boolean((this as FakeAudio & { muted?: boolean }).muted)];
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

async function installMusicKitTokenFixture(page: Page): Promise<void> {
  await page.route('**/api/v2/musickit/token', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'test.developer.token',
        expiresAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      }),
    });
  });
}

type MusicKitFixtureOutcome =
  | 'ready'
  | 'configure-error'
  | 'authorize-error'
  | 'unauthorized'
  | 'queue-error'
  | 'play-error';

async function installMusicKitFixture(
  page: Page,
  outcome: MusicKitFixtureOutcome,
  onRequest: () => void = () => undefined,
): Promise<void> {
  await page.route('https://js-cdn.music.apple.com/musickit/v3/musickit.js', async (route) => {
    onRequest();
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
            mediaPlaybackError: 'mediaPlaybackError'
          },
          PlaybackStates: { playing: 2 },
          async configure() {
            if (${JSON.stringify(outcome)} === 'configure-error') throw new Error('configure failed');
            const listeners = new Map();
            const instance = {
              isAuthorized: false,
              player: {
                playbackState: 0,
                currentPlaybackTime: 0,
                currentPlaybackDuration: 245,
                async seekToTime(seconds) {
                  this.currentPlaybackTime = seconds;
                  globalThis.__musicKitSeekTime = seconds;
                }
              },
              async authorize() {
                if (${JSON.stringify(outcome)} === 'authorize-error') throw new Error('authorization failed');
                if (${JSON.stringify(outcome)} !== 'unauthorized') this.isAuthorized = true;
                return 'user-token';
              },
              async setQueue(descriptor) {
                if (${JSON.stringify(outcome)} === 'queue-error') throw new Error('queue failed');
                globalThis.__musicKitQueue = descriptor;
              },
              async play() {
                if (${JSON.stringify(outcome)} === 'play-error') throw new Error('play failed');
                this.player.playbackState = 2;
                listeners.get('playbackStateDidChange')?.forEach((handler) => handler({}));
              },
              async pause() {
                this.player.playbackState = 3;
              },
              async stop() {
                this.player.playbackState = 0;
              },
              addEventListener(name, handler) {
                const handlers = listeners.get(name) ?? [];
                handlers.push(handler);
                listeners.set(name, handlers);
              },
            };
            globalThis.__musicKitInstance = instance;
            globalThis.__emitMusicKitError = () => {
              listeners.get('mediaPlaybackError')?.forEach((handler) => handler({}));
            };
            return instance;
          },
          getInstance() {
            return globalThis.__musicKitInstance;
          }
        };
        document.dispatchEvent(new Event('musickitloaded'));
      `,
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

type YouTubeApiOutcome = 'error' | 'ready' | 'silent';

async function installYouTubePlayerApiFixture(
  page: Page,
  outcome: () => YouTubeApiOutcome,
  onRequest: () => void = () => undefined,
): Promise<void> {
  await page.route('https://www.youtube.com/iframe_api', async (route) => {
    onRequest();
    const result = outcome();
    const callback = result === 'ready'
      ? 'options.events.onReady()'
      : result === 'error'
        ? 'options.events.onError()'
        : '';
    await route.fulfill({
      contentType: 'application/javascript',
      headers: { 'cache-control': 'no-store' },
      body: [
        'window.YT = {',
        '  Player: class {',
        '    constructor(_iframe, options) {',
        `      setTimeout(() => { ${callback}; }, 50);`,
        '    }',
        '  }',
        '};',
        'window.onYouTubeIframeAPIReady?.();',
      ].join('\n'),
    });
  });
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

    const searchButton = page.getByRole('button', { name: 'Search and commands' });
    await expect(searchButton).toBeVisible();
    await searchButton.click();
    const searchDialog = page.getByRole('dialog', { name: 'Site search and commands' });
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

  test('remeasures the TOC after preceding media changes height', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 920 });
    await page.goto('/blog/demo-effects/', { waitUntil: 'domcontentloaded' });

    const headings = page.locator('.blog-prose h2, .blog-prose h3');
    const tocLinks = page.locator('.toc-link');
    expect(await headings.count()).toBeGreaterThanOrEqual(2);
    expect(await tocLinks.count()).toBeGreaterThanOrEqual(2);

    const firstHeadingText = (await headings.first().textContent())?.trim() ?? '';
    const scrollTop = await headings.first().evaluate((heading) => {
      const spacer = document.createElement('div');
      spacer.style.height = '500px';
      spacer.setAttribute('data-e2e-preceding-shift', '');
      document.querySelector('.blog-prose')?.before(spacer);
      const scroller = document.querySelector<HTMLElement>('[data-page-scroller]')!;
      return heading.getBoundingClientRect().top + scroller.scrollTop - 95;
    });

    await scrollPageTo(page, scrollTop);
    await expect(tocLinks.first()).toHaveClass(/active/);
    await expect(page.locator('.toc-link.active')).toHaveText(firstHeadingText);
  });

  test('renders a Ghost draft preview through the real blog prose without caching', async ({ page }) => {
    const response = await page.goto(
      `/dev/blog/${GHOST_PREVIEW_E2E_POST_ID}`,
      { waitUntil: 'domcontentloaded' },
    );

    expect(response?.status()).toBe(200);
    expect(response?.headers()['cache-control']).toBe('no-store, max-age=0');
    await expect(page.locator('[data-ghost-draft-preview]')).toBeVisible();
    await expect(page.locator('.blog-article__title')).toHaveText('E2E Ghost draft');
    await expect(page.locator('.blog-prose blockquote')).toContainText('E2E preview line');
    await expect(page.locator('.ai-credit')).toContainText('Claude Opus 4.6');
    await expect(page.locator('.ai-credit')).toContainText('reviewed the draft.');
    await expect(page.locator('.not-by-ai')).toHaveCount(0);

    const invalid = await page.request.get('/dev/blog/not-a-ghost-id');
    expect(invalid.status()).toBe(404);
    expect(invalid.headers()['cache-control']).toBe('no-store, max-age=0');

    const missing = await page.request.get('/dev/blog/aaaaaaaaaaaaaaaaaaaaaaaa');
    expect(missing.status()).toBe(404);
    expect(missing.headers()['cache-control']).toBe('no-store, max-age=0');
  });

  test('probes YouTube capability on click without geo branching or overflow', async ({ page }) => {
    const posterRequests: string[] = [];
    let apiOutcome: YouTubeApiOutcome = 'ready';
    let apiRequests = 0;
    let playerRequests = 0;

    await installYouTubePlayerApiFixture(page, () => apiOutcome, () => {
      apiRequests += 1;
    });

    await page.route('**/static/youtube/**', async (route) => {
      const url = route.request().url();
      posterRequests.push(url);
      const width = url.includes('maxresdefault') ? 120 : 480;
      const height = url.includes('maxresdefault') ? 90 : 360;
      await route.fulfill({
        contentType: 'image/svg+xml',
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"></svg>`,
      });
    });
    await page.route('https://www.youtube-nocookie.com/**', async (route) => {
      playerRequests += 1;
      await route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>YouTube test player</title>',
      });
    });

    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/blog/demo-effects/', { waitUntil: 'domcontentloaded' });

    const card = page.locator('[data-yt]');
    const frame = card.locator('[data-yt-frame]');
    const player = card.locator('[data-yt-player]');
    const poster = card.locator('[data-yt-poster]');
    await expect(card).toBeVisible();
    await expect(player).not.toHaveAttribute('src', /.+/u);
    expect(apiRequests).toBe(0);
    expect(playerRequests).toBe(0);
    await expect.poll(() => posterRequests.some((url) => url.includes('hqdefault'))).toBe(true);
    await expect(poster).toHaveAttribute('src', /\/static\/youtube\/aqz-KE-bpKQ\/hqdefault\.jpg$/u);

    const frameBounds = await frame.boundingBox();
    expect(frameBounds).not.toBeNull();
    expect(frameBounds!.height).toBeGreaterThanOrEqual(200);
    expect(frameBounds!.x).toBeGreaterThanOrEqual(0);
    expect(frameBounds!.x + frameBounds!.width).toBeLessThanOrEqual(321);
    await expectNoHorizontalOverflow(page);

    await page.evaluate(() => {
      document.documentElement.dataset.country = 'CN';
    });
    await frame.click();

    await expect(card).toHaveClass(/is-loading/u);
    await expect(player).toHaveAttribute(
      'src',
      /youtube-nocookie\.com\/embed\/aqz-KE-bpKQ\?.*origin=http/u,
    );
    expect(apiRequests).toBe(1);
    expect(playerRequests).toBe(1);

    await expect(card).toHaveClass(/is-playing/u);
    await expect(player).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('youtube-embed-reachable:v1'))).toBe('yes');

    apiOutcome = 'silent';
    await page.reload({ waitUntil: 'domcontentloaded' });
    const laterCard = page.locator('[data-yt]');
    await laterCard.locator('[data-yt-frame]').click();
    await expect(laterCard).toHaveClass(/is-unreachable/u, { timeout: 7_000 });
    expect(await page.evaluate(() => sessionStorage.getItem('youtube-embed-reachable:v1'))).toBe('yes');
  });

  test('caches a silent YouTube timeout only for the current browser session', async ({ page }) => {
    let playerRequests = 0;
    await installYouTubePlayerApiFixture(page, () => 'silent');
    await page.route('**/static/youtube/**', async (route) => {
      await route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"></svg>',
      });
    });
    await page.route('https://www.youtube-nocookie.com/**', async (route) => {
      playerRequests += 1;
      await route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Silent YouTube test player</title>',
      });
    });

    await page.goto('/blog/demo-effects/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      document.documentElement.dataset.country = 'US';
      sessionStorage.removeItem('youtube-embed-reachable:v1');
    });

    const card = page.locator('[data-yt]');
    const player = card.locator('[data-yt-player]');
    await card.locator('[data-yt-frame]').click();
    await expect(card).toHaveClass(/is-loading/u);
    await expect(card).toHaveClass(/is-unreachable/u, { timeout: 7_000 });
    await expect(player).toBeHidden();
    await expect(player).not.toHaveAttribute('src', /.+/u);
    expect(playerRequests).toBe(1);
    expect(await page.evaluate(() => sessionStorage.getItem('youtube-embed-reachable:v1'))).toBe('no');

    await page.reload({ waitUntil: 'domcontentloaded' });
    const cachedCard = page.locator('[data-yt]');
    await cachedCard.locator('[data-yt-frame]').click();
    await expect(cachedCard).toHaveClass(/is-unreachable/u);
    expect(playerRequests).toBe(1);
  });

  test('keeps a player error local to one video', async ({ page }) => {
    let playerRequests = 0;
    await installYouTubePlayerApiFixture(page, () => 'error');
    await page.route('**/static/youtube/**', async (route) => {
      await route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"></svg>',
      });
    });
    await page.route('https://www.youtube-nocookie.com/**', async (route) => {
      playerRequests += 1;
      await route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>YouTube player error fixture</title>',
      });
    });

    await page.goto('/blog/demo-effects/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => sessionStorage.removeItem('youtube-embed-reachable:v1'));

    const card = page.locator('[data-yt]');
    const player = card.locator('[data-yt-player]');
    await card.locator('[data-yt-frame]').click();
    await expect(card).toHaveClass(/is-loading/u);

    await expect(card).toHaveClass(/is-unreachable/u);
    await expect(player).not.toHaveAttribute('src', /.+/u);
    expect(await page.evaluate(() => sessionStorage.getItem('youtube-embed-reachable:v1'))).toBeNull();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-yt-frame]').click();
    await expect(page.locator('[data-yt]')).toHaveClass(/is-loading/u);
    await expect.poll(() => playerRequests).toBe(2);
  });

  test('does not create horizontal overflow on mobile blog routes', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.addInitScript(() => {
      const supports = CSS.supports.bind(CSS);
      CSS.supports = ((property: string, value?: string) => {
        if (property === 'animation-timeline: scroll()') return false;
        return value === undefined ? supports(property) : supports(property, value);
      }) as typeof CSS.supports;
    });
    await page.setViewportSize({ width: 390, height: 844 });
    const href = await firstBlogPostHref(page);

    await page.goto('/blog', { waitUntil: 'domcontentloaded' });
    await expectNoHorizontalOverflow(page);

    await page.goto(href, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.blog-article__title')).toBeVisible();
    const logoGhost = page.locator('.toc-logo-ghost');
    const topbarLogo = page.locator('.toc-topbar__logo');
    await expect(logoGhost).toHaveCount(1);
    expect(await logoGhost.evaluate((element) =>
      element.style.getPropertyValue('animation-timeline')
    )).toBe('');

    await scrollPageTo(page, 180);
    await expect(page.locator('.toc-topbar')).toHaveClass(/is-visible/);
    await expect.poll(() => logoGhost.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).getPropertyValue('--dock-ride'))
    )).toBeGreaterThan(0.99);

    await expect.poll(() => logoGhost.evaluate((element) => {
      const ghostRect = element.getBoundingClientRect();
      const targetRect = document.querySelector<HTMLElement>('.toc-topbar__logo')?.getBoundingClientRect();
      if (!targetRect) throw new Error('Blog topbar logo target is missing');
      return Math.max(
        Math.abs(ghostRect.x - targetRect.x),
        Math.abs(ghostRect.y - targetRect.y),
        Math.abs(ghostRect.width - targetRect.width),
        Math.abs(ghostRect.height - targetRect.height),
      );
    })).toBeLessThanOrEqual(1.5);
    await expect(topbarLogo).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('falls back to the preview when the MusicKit token is unavailable', async ({ page }) => {
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
    expect(tokenRequests).toBe(1);
    await expect.poll(() => page.evaluate(() => (
      globalThis as typeof globalThis & { __fakeAudioMutedAtPlay?: boolean[] }
    ).__fakeAudioMutedAtPlay)).toEqual([true]);

    const progress = card.locator('[data-blog-music-progress]');
    const progressBox = await progress.boundingBox();
    expect(progressBox).not.toBeNull();
    await page.mouse.click(
      (progressBox?.x ?? 0) + (progressBox?.width ?? 0) * 0.75,
      (progressBox?.y ?? 0) + (progressBox?.height ?? 0) / 2,
    );
    await expect(progress).toHaveAttribute('aria-valuenow', '75');
    await expect(card.locator('[data-blog-music-elapsed]')).toHaveText('0:22');
    await expect(card.locator('[data-blog-music-total]')).toHaveText('0:30');

    expect({ consoleErrors, pageErrors }).toEqual({
      consoleErrors: [],
      pageErrors: [],
    });
  });

  test('plays a full track through lazy MusicKit with a safe process shim', async ({ page }) => {
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

    await installMusicKitTokenFixture(page);
    page.on('request', (request) => {
      if (request.url().endsWith('/api/v2/musickit/token')) tokenRequests += 1;
    });

    await installMusicKitFixture(page, 'ready', () => {
      sdkRequests += 1;
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
    await expect(card).toHaveClass(/is-source-full/);
    await expect(card).not.toHaveClass(/is-source-preview/);
    expect(tokenRequests).toBe(1);
    expect(sdkRequests).toBe(1);

    await expect.poll(() => page.evaluate(() => (
      globalThis as typeof globalThis & { __musicKitQueue?: unknown }
    ).__musicKitQueue)).toEqual({
      song: catalogId,
    });

    const progress = card.locator('[data-blog-music-progress]');
    const progressBox = await progress.boundingBox();
    expect(progressBox).not.toBeNull();
    await page.mouse.click(
      (progressBox?.x ?? 0) + (progressBox?.width ?? 0) / 2,
      (progressBox?.y ?? 0) + (progressBox?.height ?? 0) / 2,
    );
    await expect.poll(() => page.evaluate(() => (
      globalThis as typeof globalThis & { __musicKitSeekTime?: number }
    ).__musicKitSeekTime)).toBe(122.5);

    await page.evaluate(() => (
      globalThis as typeof globalThis & { __emitMusicKitError?: () => void }
    ).__emitMusicKitError?.());
    await expect(card).toHaveClass(/is-source-preview/);
    await expect(card).not.toHaveClass(/is-source-full/);

    expect({ consoleErrors, pageErrors }).toEqual({
      consoleErrors: [],
      pageErrors: [],
    });
  });

  for (const outcome of [
    'configure-error',
    'authorize-error',
    'unauthorized',
    'queue-error',
    'play-error',
  ] as const) {
    test(`falls back to the preview when MusicKit hits ${outcome}`, async ({ page }) => {
      await page.addInitScript(() => {
        window.process = { env: {} } as typeof window.process;
      });
      await installFakeAudio(page);
      await installMusicKitTokenFixture(page);
      await installMusicKitFixture(page, outcome);

      const href = await findBlogMusicPostHref(page);
      test.skip(!href, 'No Apple Music card is available in the current blog fixture.');
      await page.goto(href as string, { waitUntil: 'domcontentloaded' });

      const card = page.locator('[data-blog-music]').first();
      await card.locator('[data-blog-music-play]').click();
      await expect(card).toHaveClass(/is-playing/);
      await expect(card).toHaveClass(/is-source-preview/);
      await expect(card).not.toHaveClass(/is-source-full/);
    });
  }

  test('falls back to the preview when the MusicKit script fails to load', async ({ page }) => {
    await installFakeAudio(page);
    await installMusicKitTokenFixture(page);
    await page.route('https://js-cdn.music.apple.com/musickit/v3/musickit.js', (route) => route.abort());

    const href = await findBlogMusicPostHref(page);
    test.skip(!href, 'No Apple Music card is available in the current blog fixture.');
    await page.goto(href as string, { waitUntil: 'domcontentloaded' });

    const card = page.locator('[data-blog-music]').first();
    await card.locator('[data-blog-music-play]').click();
    await expect(card).toHaveClass(/is-playing/);
    await expect(card).toHaveClass(/is-source-preview/);
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
