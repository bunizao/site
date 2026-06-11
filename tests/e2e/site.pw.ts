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
    expect(await page.locator('#projects-section .project-item').count()).toBeGreaterThan(0);
    expect(await page.locator('#writing-section .post-item').count()).toBeGreaterThan(0);
    await expect(page.locator('#writing-section .post-item').first()).toHaveCSS('display', 'flex');
    await expect(page.locator('#writing-section .post-meta').first()).toHaveCSS('display', 'flex');
    await expect(page.getByRole('link', { name: 'View all on GitHub' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Read all posts' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Privacy' })).toBeVisible();

    const themeToggle = page.locator('[data-theme-toggle]');
    await expect(themeToggle).toHaveAttribute('aria-label', /mode$/);
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

  test('keeps runtime home data out of the initial HTML', async ({ page }) => {
    const response = await page.request.get('/');
    expect(response.ok()).toBeTruthy();

    const html = await response.text();
    expect(html).not.toContain('_server-islands/Listening');
    expect(html).not.toContain('Mr. Rager');
    expect(html).not.toContain('data-track-title="Mr. Rager"');
    expect(html).toContain('data-has-initial-track="false"');
    expect(html).toMatch(/data-mood-preview-initial[^>]*>\s*\[\]\s*<\/script>/);
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

    await page.route('**/api/github/contributions**', async (route) => {
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

  test('keeps the home mood loading placeholder stable while data resolves', async ({ page }) => {
    let releaseResponse: (() => void) | undefined;
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });

    await page.route('**/api/moods', async (route) => {
      await responseGate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mixedHomeMoodPayload),
      });
    });

    await page.goto('/');
    await page.locator('#moods-section').scrollIntoViewIfNeeded();

    await expect
      .poll(async () => {
        return await page.locator('#moods-section .mood-item-skeleton:visible').count();
      })
      .toBe(1);

    await page.evaluate(() => {
      const list = document.querySelector('#moods-section [data-mood-list]');
      if (!list) return;

      const state = window as typeof window & {
        __homeMoodMaxVisibleSkeletons?: number;
        __homeMoodSkeletonObserver?: MutationObserver;
      };
      const countVisibleSkeletons = () => (
        Array.from(list.querySelectorAll('.mood-item-skeleton'))
          .filter((item) => item instanceof HTMLElement && !item.hidden).length
      );

      state.__homeMoodMaxVisibleSkeletons = countVisibleSkeletons();
      state.__homeMoodSkeletonObserver = new MutationObserver(() => {
        state.__homeMoodMaxVisibleSkeletons = Math.max(
          state.__homeMoodMaxVisibleSkeletons ?? 0,
          countVisibleSkeletons(),
        );
      });
      state.__homeMoodSkeletonObserver.observe(list, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['hidden'],
      });
    });

    releaseResponse?.();
    await waitForHomeMoodState(page);

    const maxVisibleSkeletons = await page.evaluate(() => {
      const state = window as typeof window & {
        __homeMoodMaxVisibleSkeletons?: number;
        __homeMoodSkeletonObserver?: MutationObserver;
      };
      state.__homeMoodSkeletonObserver?.disconnect();
      return state.__homeMoodMaxVisibleSkeletons ?? 0;
    });

    expect(maxVisibleSkeletons).toBe(1);
  });

  test('loads GitHub contributions and shows tooltip details', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.addInitScript(() => {
      const chain = {
        heroReadyAt: 0,
        renderedAt: 0,
      };
      (window as typeof window & { __githubContributionChain?: typeof chain }).__githubContributionChain = chain;

      window.addEventListener('home:hero-github-ready', () => {
        chain.heroReadyAt = performance.now();
      });

      document.addEventListener('DOMContentLoaded', () => {
        const section = document.querySelector('[data-contributions]');
        if (!section) return;

        const recordRendered = () => {
          if (chain.renderedAt === 0 && section.getAttribute('aria-busy') === 'false') {
            chain.renderedAt = performance.now();
          }
        };

        recordRendered();
        new MutationObserver(recordRendered).observe(section, {
          attributes: true,
          attributeFilter: ['aria-busy'],
        });
      }, { once: true });
    });

    await page.route('**/api/github/contributions**', async (route) => {
      const url = new URL(route.request().url());
      expect(url.searchParams.get('days')).toBe('30');

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
    await expect(section).toHaveAttribute('aria-busy', 'false', { timeout: 4_000 });
    await expect(page.locator('[data-total]')).toContainText('321');
    const chain = await page.evaluate(() => (
      window as typeof window & {
        __githubContributionChain?: { heroReadyAt: number; renderedAt: number };
      }
    ).__githubContributionChain);
    expect(chain?.heroReadyAt).toBeGreaterThan(0);
    expect(chain?.renderedAt).toBeGreaterThanOrEqual(chain?.heroReadyAt ?? Number.POSITIVE_INFINITY);

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
    await page.route('**/api/github/contributions**', async (route) => {
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

  test('keeps mobile navbar spacing stable and releases brand space on scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('[data-site-nav]')).toBeVisible();
    await expect(page.locator('[data-hero-status]')).toBeVisible();
    await page.waitForFunction(() => document.querySelectorAll('.nav-char').length > 0);

    const initial = await page.evaluate(() => {
      const nav = document.querySelector('[data-site-nav]');
      const status = document.querySelector('[data-hero-status]');
      const headerActions = document.querySelector('[data-header-actions]');
      const toggle = document.querySelector('[data-theme-toggle]');
      const themeIcon = document.querySelector('.theme-icon-container');
      const brand = document.querySelector('[data-site-brand]');
      const projects = document.querySelector('[data-nav-link="projects"]');

      if (
        !(nav instanceof HTMLElement) ||
        !(status instanceof HTMLElement) ||
        !(headerActions instanceof HTMLElement) ||
        !(toggle instanceof HTMLElement) ||
        !(themeIcon instanceof HTMLElement) ||
        !(brand instanceof HTMLElement) ||
        !(projects instanceof HTMLElement)
      ) {
        return null;
      }

      const navRect = nav.getBoundingClientRect();
      const statusRect = status.getBoundingClientRect();
      const iconRect = themeIcon.getBoundingClientRect();
      const toggleRect = toggle.getBoundingClientRect();
      const toggleStyles = window.getComputedStyle(toggle);

      return {
        gap: statusRect.top - navRect.bottom,
        hasHomeHeaderActions: headerActions.classList.contains('global-header-actions--home'),
        toggleBackground: toggleStyles.backgroundColor,
        toggleBorder: toggleStyles.borderTopColor,
        toggleCenterDelta: Math.abs((iconRect.left + iconRect.width / 2) - (toggleRect.left + toggleRect.width / 2)),
        brandCenterDelta: Math.abs((brand.getBoundingClientRect().top + brand.getBoundingClientRect().height / 2) - (navRect.top + navRect.height / 2)),
        projectsCenterDelta: Math.abs((projects.getBoundingClientRect().top + projects.getBoundingClientRect().height / 2) - (navRect.top + navRect.height / 2)),
        brandWidth: brand.getBoundingClientRect().width,
        projectsLeft: projects.getBoundingClientRect().left,
      };
    });

    expect(initial).not.toBeNull();
    expect(initial?.gap).toBeGreaterThanOrEqual(16);
    expect(initial?.hasHomeHeaderActions).toBe(true);
    expect(initial?.toggleBackground).toBe('rgba(0, 0, 0, 0)');
    expect(initial?.toggleBorder).toBe('rgba(0, 0, 0, 0)');
    expect(initial?.toggleCenterDelta).toBeLessThanOrEqual(1);
    expect(initial?.brandCenterDelta).toBeLessThanOrEqual(1);
    expect(initial?.projectsCenterDelta).toBeLessThanOrEqual(1);

    await page.evaluate(() => {
      window.scrollTo(0, 140);
      window.dispatchEvent(new Event('scroll'));
    });
    await page.waitForFunction(() => window.scrollY > 18);

    await expect.poll(async () => {
      return await page.locator('[data-site-nav]').evaluate((node) => node.classList.contains('is-brand-eaten'));
    }).toBe(true);

    const readCollapsed = async () =>
      await page.evaluate(() => {
        const brand = document.querySelector('[data-site-brand]');
        const brandText = document.querySelector('[data-mobile-brand-text]');
        const projects = document.querySelector('[data-nav-link="projects"]');

        if (
          !(brand instanceof HTMLElement) ||
          !(brandText instanceof HTMLElement) ||
          !(projects instanceof HTMLElement)
        ) {
          return null;
        }

        const brandStyles = window.getComputedStyle(brand);
        const brandTextStyles = window.getComputedStyle(brandText);
        const nav = document.querySelector('[data-site-nav]');

        if (!(nav instanceof HTMLElement)) {
          return null;
        }

        const navRect = nav.getBoundingClientRect();
        const brandRect = brand.getBoundingClientRect();
        const projectsRect = projects.getBoundingClientRect();

        return {
          brandMinWidth: brandStyles.minWidth,
          brandTextMaxWidth: brandTextStyles.maxWidth,
          brandTextOpacity: brandTextStyles.opacity,
          brandCenterDelta: Math.abs((brandRect.top + brandRect.height / 2) - (navRect.top + navRect.height / 2)),
          projectsCenterDelta: Math.abs((projectsRect.top + projectsRect.height / 2) - (navRect.top + navRect.height / 2)),
          projectsLeft: projects.getBoundingClientRect().left,
        };
      });

    await expect.poll(readCollapsed, { timeout: 2_000 }).toMatchObject({
      brandMinWidth: '40px',
      brandTextMaxWidth: '0px',
      brandTextOpacity: '0',
    });

    const collapsed = await readCollapsed();
    expect(collapsed).not.toBeNull();
    expect(collapsed?.brandCenterDelta).toBeLessThanOrEqual(1);
    expect(collapsed?.projectsCenterDelta).toBeLessThanOrEqual(1);
    expect(collapsed?.projectsLeft).toBeLessThan((initial?.projectsLeft ?? 0) - 20);
  });

  test('keeps mobile navbar pinned when the visual viewport shifts', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      let offsetTop = 0;
      const viewport = new EventTarget();

      Object.defineProperties(viewport, {
        offsetTop: { get: () => offsetTop },
        offsetLeft: { get: () => 0 },
        width: { get: () => window.innerWidth },
        height: { get: () => window.innerHeight },
        scale: { get: () => 1 },
      });

      Object.defineProperty(window, 'visualViewport', {
        configurable: true,
        value: viewport,
      });

      (window as Window & { __setVisualViewportTop?: (top: number) => void }).__setVisualViewportTop = (top) => {
        offsetTop = top;
        viewport.dispatchEvent(new Event('resize'));
        viewport.dispatchEvent(new Event('scroll'));
      };
    });

    await page.goto('/');
    await expect(page.locator('[data-site-nav]')).toBeVisible();

    const initial = await page.locator('[data-site-nav]').boundingBox();
    expect(initial).not.toBeNull();

    await page.evaluate(() => {
      (window as unknown as Window & { __setVisualViewportTop: (top: number) => void }).__setVisualViewportTop(24);
    });

    await expect.poll(async () => (
      await page.evaluate(() =>
        window.getComputedStyle(document.documentElement).getPropertyValue('--visual-viewport-top').trim()
      )
    )).toBe('24px');

    const shifted = await page.locator('[data-site-nav]').boundingBox();
    expect(shifted).not.toBeNull();
    expect(Math.round((shifted?.y ?? 0) - (initial?.y ?? 0))).toBe(24);

    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      window.dispatchEvent(new Event('scroll'));
    });
    await page.waitForFunction(() => {
      const root = document.documentElement;
      return Math.ceil(window.scrollY + window.innerHeight) >= root.scrollHeight - 2;
    });

    const bottomPinned = await page.locator('[data-site-nav]').boundingBox();
    expect(bottomPinned).not.toBeNull();

    await page.evaluate(() => {
      (window as unknown as Window & { __setVisualViewportTop: (top: number) => void }).__setVisualViewportTop(160);
    });

    await expect.poll(async () => (
      await page.evaluate(() =>
        window.getComputedStyle(document.documentElement).getPropertyValue('--visual-viewport-top').trim()
      )
    )).toBe('0px');

    const bottomOverscrolled = await page.locator('[data-site-nav]').boundingBox();
    expect(bottomOverscrolled).not.toBeNull();
    expect(Math.round((bottomOverscrolled?.y ?? 0) - (bottomPinned?.y ?? 0))).toBe(0);

    await page.evaluate(() => {
      window.scrollBy(0, -36);
      (window as unknown as Window & { __setVisualViewportTop: (top: number) => void }).__setVisualViewportTop(72);
    });

    await expect.poll(async () => (
      await page.evaluate(() =>
        window.getComputedStyle(document.documentElement).getPropertyValue('--visual-viewport-top').trim()
      )
    )).toBe('0px');

    const bottomBounceRelease = await page.locator('[data-site-nav]').boundingBox();
    expect(bottomBounceRelease).not.toBeNull();
    expect(Math.round((bottomBounceRelease?.y ?? 0) - (bottomPinned?.y ?? 0))).toBe(0);

    await page.evaluate(() => {
      (window as unknown as Window & { __setVisualViewportTop: (top: number) => void }).__setVisualViewportTop(0);
      window.scrollBy(0, -140);
      (window as unknown as Window & { __setVisualViewportTop: (top: number) => void }).__setVisualViewportTop(24);
    });

    await expect.poll(async () => (
      await page.evaluate(() =>
        window.getComputedStyle(document.documentElement).getPropertyValue('--visual-viewport-top').trim()
      )
    )).toBe('24px');
  });
});
