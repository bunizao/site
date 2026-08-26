import { devices, type Page } from '@playwright/test';
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
      appleCatalogId: '',
      catalogId: '',
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

  test('starts the bio decode after the hero identity reveal', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    // This case exercises reservation layout, not browser font-download timing.
    // Resolve the FontFaceSet immediately so a busy CI runner cannot select the
    // intentional no-reservation fallback before the assertions run.
    await page.addInitScript(() => {
      const chain = {
        bioReadyAt: 0,
        bioAnimatingAt: 0,
      };
      (window as typeof window & { __heroBioDecodeChain?: typeof chain }).__heroBioDecodeChain = chain;

      window.addEventListener('home:hero-bio-ready', () => {
        chain.bioReadyAt = performance.now();
      });

      new MutationObserver((records) => {
        if (chain.bioAnimatingAt > 0) return;
        const started = records.some((record) => (
          record.target instanceof HTMLElement &&
          record.target.matches('[data-hero-bio] [data-decode-root]') &&
          record.target.classList.contains('dt-animating')
        ));
        if (started) chain.bioAnimatingAt = performance.now();
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
    });

    await page.goto('/');

    const decodeRoot = page.locator('[data-hero-bio] [data-decode-root]');
    await expect(decodeRoot).toHaveClass(/dt-prepared/, { timeout: 4_000 });
    await expect
      .poll(
        () => page.evaluate(() => (
          window as typeof window & {
            __heroBioDecodeChain?: { bioReadyAt: number; bioAnimatingAt: number };
          }
        ).__heroBioDecodeChain?.bioAnimatingAt ?? 0),
        { timeout: 4_000 }
      )
      .toBeGreaterThan(0);

    const chain = await page.evaluate(() => (
      window as typeof window & {
        __heroBioDecodeChain?: { bioReadyAt: number; bioAnimatingAt: number };
      }
    ).__heroBioDecodeChain);
    expect(chain?.bioReadyAt).toBeGreaterThan(0);
    expect(chain?.bioAnimatingAt).toBeGreaterThanOrEqual(chain?.bioReadyAt ?? Number.POSITIVE_INFINITY);
  });

  test('keeps settled decoded cells stable while resolution stays interleaved', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.addInitScript(() => {
      let seed = 0x2f6e2b1;
      Math.random = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 0x100000000;
      };
    });

    await page.goto('/', { waitUntil: 'networkidle' });

    const decodeRoot = page.locator('[data-hero-bio] [data-decode-root]');
    await expect(decodeRoot).toHaveClass(/dt-prepared/);
    const result = await decodeRoot.evaluate(
      (root) => new Promise<{
        stable: boolean;
        interleaved: boolean;
        slotCountStable: boolean;
        textMatches: boolean;
        snapshot?: string;
      }>((resolve) => {
        const deadline = performance.now() + 4_000;
        const cells = Array.from(root.querySelectorAll<HTMLElement>('.dt-c'));
        const slotCount = cells.length;
        const source = Array.from(root.children)
          .find((element) => element instanceof HTMLSpanElement && element.style.cssText.includes('position: absolute'))
          ?.textContent ?? '';
        const settled = new Map<HTMLElement, string>();
        let interleaved = false;

        // Visual lines are block spans with boundary whitespace trimmed, so
        // compare the content stream without layout-only whitespace.
        const compact = (value: string): string => value.replace(/\s+/g, '');
        const isFinal = (cell: HTMLElement): boolean => (
          !cell.dataset.state &&
          Boolean(cell.textContent) &&
          cell.textContent !== '\u00a0' &&
          cell.textContent !== ' '
        );

        const inspect = () => {
          const currentCells = Array.from(root.querySelectorAll<HTMLElement>('.dt-c'));
          if (currentCells.length !== slotCount) {
            resolve({
              stable: true,
              interleaved,
              slotCountStable: false,
              textMatches: false,
            });
            return;
          }

          for (const line of root.querySelectorAll('.dt-line')) {
            let foundUnsettledLetter = false;
            for (const cell of line.querySelectorAll<HTMLElement>('.dt-c')) {
              if (cell.textContent === ' ') {
                foundUnsettledLetter = false;
                continue;
              }

              const finalText = settled.get(cell);
              if (finalText !== undefined && (cell.dataset.state || cell.textContent !== finalText)) {
                resolve({
                  stable: false,
                  interleaved,
                  slotCountStable: true,
                  textMatches: false,
                  snapshot: Array.from(line.querySelectorAll<HTMLElement>('.dt-c'))
                    .map((item) => `${item.textContent || '∅'}:${item.dataset.state || 'final'}`)
                    .join('|'),
                });
                return;
              }
              if (isFinal(cell)) {
                settled.set(cell, cell.textContent ?? '');
                if (foundUnsettledLetter) interleaved = true;
              } else {
                foundUnsettledLetter = true;
              }
            }
          }

          const complete = currentCells.every((cell) => (
            cell.textContent === ' ' || isFinal(cell)
          ));
          if (!root.classList.contains('dt-animating') && complete) {
            const finalText = compact(root.textContent ?? '');
            const sourceText = compact(source);
            resolve({
              stable: true,
              interleaved,
              slotCountStable: true,
              textMatches: finalText === sourceText,
              snapshot: `source=${sourceText}|final=${finalText}`,
            });
          } else if (performance.now() < deadline) {
            requestAnimationFrame(inspect);
          } else {
            resolve({
              stable: true,
              interleaved,
              slotCountStable: true,
              textMatches: false,
            });
          }
        };

        requestAnimationFrame(inspect);
      })
    );

    expect(result.stable, result.snapshot).toBe(true);
    expect(result.interleaved).toBe(true);
    expect(result.slotCountStable).toBe(true);
    expect(result.textMatches, result.snapshot).toBe(true);
  });

  test('renders core sections and persists selected theme', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle('Lucian Bu — Student, Developer & Blogger');
    await expect(page.locator('[data-hero-name]')).toBeVisible();
    await expect(page.locator('#projects-section')).toBeVisible();
    await expect(page.locator('#writing-section')).toBeVisible();
    await expect(page.locator('#moods-section')).toBeVisible();
    await expect(page.locator('#projects-section')).not.toHaveCSS('content-visibility', 'auto');
    await expect(page.locator('#projects-section [aria-label="Projects"] article')).toHaveCount(4);
    expect(await page.locator('#writing-section .post-item').count()).toBeGreaterThan(0);
    await expect(page.locator('#writing-section .post-item').first()).toHaveCSS('display', 'flex');
    await expect(page.locator('#writing-section .post-meta').first()).toHaveCSS('display', 'flex');
    await expect(page.getByRole('button', { name: 'Tell me more' }).first()).toBeVisible();
    // Writing is a doorway into the blog now: the publication sign and the
    // bottom CTA both link internally to the canonical trailing-slash route.
    await expect(page.locator('#writing-section .writing-portal')).toHaveAttribute('href', '/blog/');
    await expect(page.locator('#writing-section .writing-enter')).toBeVisible();
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

  test('releases the spotlight compositor layer after its idle fade', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');

    const spotlight = page.locator('[data-spotlight-overlay]');
    await page.waitForTimeout(1_000);
    await page.mouse.move(180, 180);
    await expect(spotlight).toHaveClass(/is-active/);
    await expect(spotlight).not.toHaveClass(/is-active/, { timeout: 3_000 });
  });

  test('bounds active project carousel images and accessible alternatives', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');

    const projects = page.locator('#projects-section');
    await projects.scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'Show ogis' }).click();

    const activeCard = projects.locator('article[aria-hidden="false"]');
    await expect(activeCard.locator('img[src*="/projects/ogis/"]')).toHaveCount(2);
    await expect(activeCard.locator('img[alt^="OG card:"]')).toHaveCount(1);

    await expect
      .poll(
        async () => {
          const sources = await activeCard
            .locator('img[src*="/projects/ogis/"]')
            .evaluateAll((images) => images.map((image) => image.getAttribute('src')));
          return new Set(sources).size;
        },
        { timeout: 3_000 },
      )
      .toBeGreaterThan(1);
    expect(await activeCard.locator('img[src*="/projects/ogis/"]').count()).toBeLessThanOrEqual(4);
    await expect(activeCard.locator('img[alt^="OG card:"]')).toHaveCount(1);
    await expect(activeCard.locator('img[aria-hidden="true"][alt=""]')).not.toHaveCount(0);
  });

  test('pauses and resumes homepage ambient animation offscreen', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const contributions = Array.from({ length: 30 }, (_, index) => ({
      date: `2026-02-${String(index + 1).padStart(2, '0')}`,
      count: (index % 5) + 1,
      level: 1,
    }));
    await page.route('**/api/github/contributions**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ total: { lastYear: 321 }, contributions }),
      });
    });
    await page.goto('/');

    const contributionSection = page.locator('[data-contributions]');
    await expect(contributionSection).toHaveClass(/is-breathing-active/, { timeout: 5_000 });
    const projects = page.locator('#projects-section');
    await projects.scrollIntoViewIfNeeded();
    await expect(contributionSection).toHaveClass(/is-breathing/);
    await expect(contributionSection).not.toHaveClass(/is-breathing-active/);

    const currentProject = projects.locator('[aria-current="true"]');
    const projectBefore = await currentProject.getAttribute('aria-label');
    await page.locator('#writing-section').scrollIntoViewIfNeeded();
    await page.waitForTimeout(5_800);
    expect(await currentProject.getAttribute('aria-label')).toBe(projectBefore);

    await contributionSection.scrollIntoViewIfNeeded();
    await expect(contributionSection).toHaveClass(/is-breathing-active/);

    await projects.scrollIntoViewIfNeeded();
    await expect
      .poll(() => currentProject.getAttribute('aria-label'), { timeout: 7_000 })
      .not.toBe(projectBefore);
  });

  test('cleans up theme transitions across both theme controls', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');

    const soundRequest = page.waitForRequest((request) => request.url().endsWith('/audio/theme-switch.mp3'));
    await page.locator('[data-theme-dropdown]').hover();
    await page.locator('[data-theme-option="dark"]').click();
    await soundRequest;
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect
      .poll(() =>
        page.locator('html').evaluate((node) =>
          ['theme-wipe', 'theme-wipe-webkit', 'no-transition'].some((name) => node.classList.contains(name))
        )
      )
      .toBe(false);

    await page.goto('/dev/portal');
    const portalToggle = page.locator('[data-portal-theme-toggle]');
    await expect(portalToggle).toBeVisible();
    await portalToggle.click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await expect
      .poll(() =>
        page.locator('html').evaluate((node) =>
          ['theme-wipe', 'theme-wipe-webkit', 'no-transition'].some((name) => node.classList.contains(name))
        )
      )
      .toBe(false);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('theme'))).toBe('light');
  });

  test('skips transient theme classes with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/dev/portal');
    await page.locator('[data-portal-theme-toggle]').click();

    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.locator('html')).not.toHaveClass(/theme-wipe|theme-wipe-webkit|no-transition/);
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

  test('renders structured media-only mood previews on the home page', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem('home-moods-preview-cache:v2');
    });

    await page.route('**/api/moods', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          posts: [
            {
              id: '1004',
              datetime: '2026-02-10T12:30:00+00:00',
              previewText: '',
              previewHtml: '',
              media: [
                {
                  type: 'link-preview',
                  href: 'https://example.test/story',
                  title: 'Structured link preview',
                  siteName: 'Example',
                  thumbnailSrc: '/avatar.webp',
                },
              ],
              image: null,
              mediaHtml: '',
              needsDetailPage: true,
              reactions: [],
              commentsCount: 0,
            },
          ],
          channel: homeMoodPayload.channel,
        }),
      });
    });

    await page.goto('/');
    await page.locator('#moods-section').scrollIntoViewIfNeeded();

    await waitForHomeMoodState(page);

    const moodCard = page.locator('#moods-section .mood-card').first();
    await expect(moodCard).toContainText('Structured link preview');
    await expect(moodCard).not.toContainText('(No text)');
    await expect(moodCard.locator('.mood-thumbnail img')).toHaveAttribute('src', /avatar\.webp/);
  });

  test('reserves mixed home mood preview heights without runtime errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    const notFoundResponses: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && !isIgnorableDevConsoleError(message.text())) {
        consoleErrors.push(message.text());
      }
    });
    page.on('response', (response) => {
      if (response.status() === 404) notFoundResponses.push(response.url());
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

    await page.addInitScript(() => {
      const fonts = document.fonts;
      Object.defineProperty(fonts, 'ready', {
        configurable: true,
        value: Promise.resolve(fonts),
      });
      Object.defineProperty(fonts, 'load', {
        configurable: true,
        value: async () => [],
      });
    });

    await page.goto('/');
    await page.locator('#moods-section').scrollIntoViewIfNeeded();

    await waitForHomeMoodState(page);

    const cards = page.locator('#moods-section .mood-card');
    await expect(cards).toHaveCount(3);
    await expect(page.locator('#moods-section [data-mood-error]')).toBeHidden();

    await expect.poll(async () => {
      return await cards.evaluateAll((nodes) =>
        nodes.filter((node) => node.getAttribute('data-reserved') === 'true').length
      );
    }).toBe(3);

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
    expect({ consoleErrors, notFoundResponses }).toEqual({
      consoleErrors: [],
      notFoundResponses: [],
    });
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
    let legacyRequests = 0;

    await page.route('**/api/v2/listening', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(listeningPayload),
      });
    });
    await page.route('**/api/listening', async (route) => {
      legacyRequests += 1;
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'legacy route should not be used' }),
      });
    });

    await page.setViewportSize({ width: 741, height: 957 });
    await page.goto('/');

    const track = page.locator('[data-listening-link]');
    const title = page.locator('[data-listening-title]');

    await expect(page.locator('[data-listening-title-label]')).toHaveText('All of the Lights');
    await expect(track).toHaveClass(/is-inline/);
    await expect(title).not.toHaveClass(/is-marquee/);
    expect(legacyRequests).toBe(0);

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

  test('falls back to legacy listening data when v2 is unavailable', async ({ page }) => {
    let v2Requests = 0;
    let legacyRequests = 0;

    await page.route('**/api/v2/listening', async (route) => {
      v2Requests += 1;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'v2 unavailable' }),
      });
    });
    await page.route('**/api/listening', async (route) => {
      legacyRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(createListeningPayload({
          title: 'Legacy Listening Track',
          artist: 'Fallback Artist',
        })),
      });
    });

    await page.goto('/');

    await expect(page.locator('[data-listening-title-label]')).toHaveText('Legacy Listening Track');
    await expect(page.locator('[data-listening-artist]')).toHaveText('Fallback Artist');
    expect(v2Requests).toBeGreaterThan(0);
    expect(legacyRequests).toBeGreaterThan(0);
  });

  test('pauses listening refreshes while hidden and refreshes once on refocus', async ({ page }) => {
    let v2Requests = 0;

    await page.addInitScript(() => {
      let visibilityState = 'visible';
      let timerId = 1_000;
      const listeningTimers = new Map<number, () => void | Promise<void>>();
      const nativeSetTimeout = window.setTimeout.bind(window);
      const nativeClearTimeout = window.clearTimeout.bind(window);

      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => visibilityState,
      });
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => visibilityState !== 'visible',
      });

      (window as typeof window & {
        __setListeningVisibility?: (state: 'visible' | 'hidden') => void;
        __runListeningTimer?: () => Promise<void>;
      }).__setListeningVisibility = (state) => {
        visibilityState = state;
        document.dispatchEvent(new Event('visibilitychange'));
      };
      (window as typeof window & {
        __runListeningTimer?: () => Promise<void>;
      }).__runListeningTimer = async () => {
        const [id, callback] = Array.from(listeningTimers.entries()).at(-1) ?? [];
        if (!id || !callback) return;
        listeningTimers.delete(id);
        await callback();
      };

      window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
        if (timeout === 45_000) {
          const id = timerId;
          timerId += 1;
          listeningTimers.set(id, () => {
            if (typeof handler === 'function') {
              return handler(...args);
            }
            return window.eval(handler);
          });
          return id;
        }

        return nativeSetTimeout(handler, timeout, ...args);
      }) as typeof window.setTimeout;
      window.clearTimeout = ((id?: number) => {
        if (typeof id === 'number' && listeningTimers.delete(id)) {
          return;
        }

        nativeClearTimeout(id);
      }) as typeof window.clearTimeout;
    });

    await page.route('**/api/v2/listening', async (route) => {
      v2Requests += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(createListeningPayload({
          title: `Listening Poll ${v2Requests}`,
        })),
      });
    });

    await page.goto('/');
    await expect.poll(() => v2Requests).toBeGreaterThan(0);

    await page.evaluate(() => {
      (window as typeof window & {
        __setListeningVisibility?: (state: 'visible' | 'hidden') => void;
      }).__setListeningVisibility?.('hidden');
    });
    const hiddenRequestCount = v2Requests;
    await page.evaluate(async () => {
      await (window as typeof window & {
        __runListeningTimer?: () => Promise<void>;
      }).__runListeningTimer?.();
    });
    expect(v2Requests).toBe(hiddenRequestCount);

    await page.evaluate(() => {
      (window as typeof window & {
        __setListeningVisibility?: (state: 'visible' | 'hidden') => void;
      }).__setListeningVisibility?.('visible');
    });
    await expect.poll(() => v2Requests).toBe(hiddenRequestCount + 1);
    await page.evaluate(async () => {
      await (window as typeof window & {
        __runListeningTimer?: () => Promise<void>;
      }).__runListeningTimer?.();
    });
    await expect.poll(() => v2Requests).toBe(hiddenRequestCount + 2);
    await page.waitForTimeout(20);
    expect(v2Requests).toBe(hiddenRequestCount + 2);
  });

  test('shows the listening wave when MusicKit falls back to a recent track preview', async ({ page }) => {
    let tokenRequests = 0;

    await page.addInitScript(() => {
      class FakeAudio extends EventTarget {
        paused = true;
        currentTime = 0;
        preload = '';
        duration = 30;
        src = '';

        constructor(src = '') {
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

    await page.route('**/api/musickit/token', async (route) => {
      tokenRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });
    await page.route('**/api/v2/listening', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(createListeningPayload({
          appleCatalogId: '1440835848',
          catalogId: '1440835848',
          isNowPlaying: false,
          previewUrl: 'https://example.com/preview.m4a',
        })),
      });
    });

    await page.goto('/');

    const root = page.locator('[data-listening]');
    const playButton = page.locator('[data-listening-play]');
    await expect(page.locator('[data-listening-status]')).toHaveText('Recently Played');
    await expect(playButton).toHaveAttribute('data-apple-catalog-id', '1440835848');

    await playButton.click();
    await expect(root).toHaveClass(/is-preview-playing/);
    await expect(playButton).toHaveClass(/is-preview-playing/);
    expect(tokenRequests).toBe(0);

    const waveWidth = await page.locator('.listening-eyebrow-wave').evaluate((node) => {
      return Number.parseFloat(window.getComputedStyle(node).width);
    });
    expect(waveWidth).toBeGreaterThan(0);
  });

  test('opens the listening track when artwork has no preview audio', async ({ page }) => {
    await page.route('**/api/v2/listening', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(createListeningPayload({
          appleCatalogId: '',
          catalogId: '',
          previewUrl: '',
          appleMusicUrl: 'https://music.apple.com/test-listening-click',
        })),
      });
    });

    await page.goto('/');

    const playButton = page.locator('[data-listening-play]');
    const trackLink = page.locator('[data-listening-link]');
    await expect(playButton).toBeEnabled();
    await expect(playButton).toHaveAttribute('aria-label', 'Open All of the Lights');
    await expect(trackLink).toHaveAttribute('href', 'https://music.apple.com/test-listening-click');

    await page.evaluate(() => {
      const openedUrls: string[] = [];
      (window as typeof window & { __openedListeningUrls?: string[] }).__openedListeningUrls = openedUrls;
      window.open = (url?: string | URL) => {
        if (url) openedUrls.push(String(url));
        return null;
      };
    });
    await playButton.click();
    await expect.poll(() => page.evaluate(() => (
      window as typeof window & { __openedListeningUrls?: string[] }
    ).__openedListeningUrls)).toEqual(['https://music.apple.com/test-listening-click']);
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

  test('keeps mobile navbar spacing stable with the wordmark and menu trigger', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const nav = page.locator('[data-site-nav]');
    const wordmark = page.locator('[data-mobile-brand-text]');
    const inlineLinks = page.locator('[data-nav-links]');
    const menuTrigger = page.locator('[data-menu-trigger]');

    await expect(nav).toBeVisible();
    await expect(page.locator('[data-hero-status]')).toBeVisible();
    await expect(wordmark).toBeVisible();
    await expect(wordmark).toHaveText('buxx.me');
    await expect(inlineLinks).toBeHidden();
    await expect(menuTrigger).toBeVisible();

    const readNavbarState = () => page.evaluate(() => {
      const nav = document.querySelector('[data-site-nav]');
      const status = document.querySelector('[data-hero-status]');
      const headerActions = document.querySelector('[data-header-actions]');
      const toggle = document.querySelector('[data-theme-toggle]');
      const themeIcon = document.querySelector('.theme-icon-container');
      const brand = document.querySelector('[data-site-brand]');
      const brandText = document.querySelector('[data-mobile-brand-text]');
      const navLinks = document.querySelector('[data-nav-links]');
      const trigger = document.querySelector('[data-menu-trigger]');
      const triggerIcon = document.querySelector('.menu-trigger-icons');

      if (
        !(nav instanceof HTMLElement) ||
        !(status instanceof HTMLElement) ||
        !(headerActions instanceof HTMLElement) ||
        !(toggle instanceof HTMLElement) ||
        !(themeIcon instanceof HTMLElement) ||
        !(brand instanceof HTMLElement) ||
        !(brandText instanceof HTMLElement) ||
        !(navLinks instanceof HTMLElement) ||
        !(trigger instanceof HTMLElement) ||
        !(triggerIcon instanceof HTMLElement)
      ) {
        return null;
      }

      const navRect = nav.getBoundingClientRect();
      const statusRect = status.getBoundingClientRect();
      const iconRect = themeIcon.getBoundingClientRect();
      const toggleRect = toggle.getBoundingClientRect();
      const brandRect = brand.getBoundingClientRect();
      const brandTextRect = brandText.getBoundingClientRect();
      const triggerRect = trigger.getBoundingClientRect();
      const triggerIconRect = triggerIcon.getBoundingClientRect();
      const toggleStyles = window.getComputedStyle(toggle);
      const brandTextStyles = window.getComputedStyle(brandText);
      const navLinksStyles = window.getComputedStyle(navLinks);
      const triggerStyles = window.getComputedStyle(trigger);

      return {
        gap: statusRect.top - navRect.bottom,
        hasHomeHeaderActions: headerActions.classList.contains('global-header-actions--home'),
        toggleBackground: toggleStyles.backgroundColor,
        toggleBorder: toggleStyles.borderTopColor,
        toggleCenterDelta: Math.abs((iconRect.left + iconRect.width / 2) - (toggleRect.left + toggleRect.width / 2)),
        brandCenterDelta: Math.abs((brandRect.top + brandRect.height / 2) - (navRect.top + navRect.height / 2)),
        triggerCenterDelta: Math.abs((triggerRect.top + triggerRect.height / 2) - (toggleRect.top + toggleRect.height / 2)),
        triggerIconCenterDelta: Math.max(
          Math.abs((triggerIconRect.left + triggerIconRect.width / 2) - (triggerRect.left + triggerRect.width / 2)),
          Math.abs((triggerIconRect.top + triggerIconRect.height / 2) - (triggerRect.top + triggerRect.height / 2)),
        ),
        actionGap: triggerRect.left - toggleRect.right,
        brandTriggerGap: triggerRect.left - brandRect.right,
        navHeight: navRect.height,
        brandWidth: brandRect.width,
        brandTextWidth: brandTextRect.width,
        brandTextOpacity: brandTextStyles.opacity,
        inlineLinksDisplay: navLinksStyles.display,
        triggerDisplay: triggerStyles.display,
        triggerWidth: triggerRect.width,
        triggerHeight: triggerRect.height,
      };
    });

    const initial = await readNavbarState();

    expect(initial).not.toBeNull();
    expect(initial?.gap).toBeGreaterThanOrEqual(16);
    expect(initial?.hasHomeHeaderActions).toBe(true);
    expect(initial?.toggleBackground).toBe('rgba(0, 0, 0, 0)');
    expect(initial?.toggleBorder).toBe('rgba(0, 0, 0, 0)');
    expect(initial?.toggleCenterDelta).toBeLessThanOrEqual(1);
    expect(initial?.brandCenterDelta).toBeLessThanOrEqual(1);
    expect(initial?.triggerCenterDelta).toBeLessThanOrEqual(1);
    expect(initial?.triggerIconCenterDelta).toBeLessThanOrEqual(1);
    expect(initial?.actionGap).toBeGreaterThanOrEqual(2);
    expect(initial?.brandTriggerGap).toBeGreaterThan(16);
    expect(initial?.brandTextWidth).toBeGreaterThan(70);
    expect(initial?.brandTextOpacity).toBe('1');
    expect(initial?.inlineLinksDisplay).toBe('none');
    expect(initial?.triggerDisplay).toBe('flex');
    expect(initial?.triggerWidth).toBeGreaterThanOrEqual(44);
    expect(initial?.triggerHeight).toBeGreaterThanOrEqual(44);

    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo(0, 140);
    });
    await page.waitForFunction(() => window.scrollY > 18);

    await expect(wordmark).toBeVisible();
    await expect(inlineLinks).toBeHidden();
    await expect(menuTrigger).toBeVisible();

    const afterScroll = await readNavbarState();
    expect(afterScroll).not.toBeNull();
    expect(afterScroll?.brandCenterDelta).toBeLessThanOrEqual(1);
    expect(afterScroll?.triggerCenterDelta).toBeLessThanOrEqual(1);
    expect(afterScroll?.triggerIconCenterDelta).toBeLessThanOrEqual(1);
    expect(Math.abs((afterScroll?.navHeight ?? 0) - (initial?.navHeight ?? 0))).toBeLessThanOrEqual(1);
    expect(Math.abs((afterScroll?.brandWidth ?? 0) - (initial?.brandWidth ?? 0))).toBeLessThanOrEqual(1);
    expect(Math.abs((afterScroll?.brandTextWidth ?? 0) - (initial?.brandTextWidth ?? 0))).toBeLessThanOrEqual(1);
    expect(Math.abs((afterScroll?.actionGap ?? 0) - (initial?.actionGap ?? 0))).toBeLessThanOrEqual(1);
    expect(Math.abs((afterScroll?.brandTriggerGap ?? 0) - (initial?.brandTriggerGap ?? 0))).toBeLessThanOrEqual(1);
    expect(afterScroll?.brandTextOpacity).toBe('1');
    expect(afterScroll?.inlineLinksDisplay).toBe('none');
    expect(afterScroll?.triggerDisplay).toBe('flex');
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

test.describe('Blog posts', () => {
  test('hides the table of contents for posts tagged no-toc', async ({ page }) => {
    const response = await page.goto('/blog/quiet-architecture/');
    expect(response?.ok()).toBeTruthy();

    await expect(page.locator('.toc-container')).toHaveAttribute('hidden', '');
    await expect(page.locator('.toc-link')).toHaveCount(0);
  });

  test('renders the table of contents for posts with enough headings', async ({ page }) => {
    await page.goto('/blog/demo-effects/');

    await expect(page.locator('.toc-container')).toBeVisible();
    expect(await page.locator('.toc-link').count()).toBeGreaterThanOrEqual(2);
  });
});

test.describe('Home page mobile touch', () => {
  test('reveals hidden experience rows on tap and keeps them open', async ({ browser }, testInfo) => {
    const iphone = devices['iPhone 13'];
    const context = await browser.newContext({
      baseURL: String(testInfo.project.use.baseURL),
      deviceScaleFactor: iphone.deviceScaleFactor,
      hasTouch: iphone.hasTouch,
      isMobile: iphone.isMobile,
      screen: { width: 390, height: 844 },
      userAgent: iphone.userAgent,
      viewport: iphone.viewport,
    });
    const page = await context.newPage();

    try {
      await page.emulateMedia({ reducedMotion: 'no-preference' });

      await page.goto('/');
      expect(page.url()).toBe(`${String(testInfo.project.use.baseURL)}/`);
      await page.locator('#experience-section').scrollIntoViewIfNeeded();
      await expect(page.locator('[data-experience-timeline="hydrated"]')).toHaveCount(1);

      const jokeRows = page.locator('#experience-section [data-experience-joke-row]');
      await expect(jokeRows).toHaveCount(2);
      await expect(jokeRows.first()).toHaveAttribute('data-revealed', 'false');

      const firstLink = jokeRows.first().getByRole('link', { name: 'Anthropic' });
      const firstTapResult = await firstLink.evaluate((node) => {
        node.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true }));
        const touchEnd = new TouchEvent('touchend', { bubbles: true, cancelable: true });
        const click = new MouseEvent('click', { bubbles: true, cancelable: true });
        const touchEndWasPrevented = !node.dispatchEvent(touchEnd);
        const clickWasPrevented = !node.dispatchEvent(click);

        return {
          clickWasPrevented,
          touchEndWasPrevented,
        };
      });

      await expect(jokeRows.first()).toHaveAttribute('data-revealed', 'true');
      await expect(jokeRows.nth(1)).toHaveAttribute('data-revealed', 'true');
      expect(firstTapResult).toEqual({
        clickWasPrevented: true,
        touchEndWasPrevented: true,
      });

      await page.touchscreen.tap(10, 10);
      await expect(jokeRows.first()).toHaveAttribute('data-revealed', 'true');
    } finally {
      await context.close();
    }
  });
});

test.describe('Projects editorial ledger', () => {
  test('renders every project as a semantic desktop entry', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/projects');

    await expect(page.getByRole('heading', { name: 'Things I made, and still run.' })).toBeVisible();
    const entries = page.locator('.proj-list > .proj-entry');
    await expect(entries).toHaveCount(4);
    await expect(entries.locator('h2')).toHaveText([
      'Tools for Agents',
      'ogis',
      'Attegi',
      'TutuBetterRules',
    ]);
    await expect(entries.locator('.hero-panel')).toHaveCount(4);
    await expect(entries.locator('.proj-link')).toHaveCount(4);
    await expect(entries.first().locator('.proj-link')).toHaveAttribute('target', '_blank');
    await expect(page.locator('footer.footer')).toBeVisible();

    const layout = await entries.evaluateAll((nodes) => nodes.slice(0, 2).map((node) => {
      const entry = node as HTMLElement;
      const visual = entry.querySelector<HTMLElement>('.proj-visual');
      return {
        columns: getComputedStyle(entry).gridTemplateColumns,
        visualOrder: visual ? getComputedStyle(visual).order : '',
      };
    }));
    expect(layout[0].columns).not.toBe('none');
    expect(layout.map((entry) => entry.visualOrder)).toEqual(['-1', '1']);
  });

  test('keeps the ledger readable without horizontal overflow on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/projects');

    const entries = page.locator('.proj-list > .proj-entry');
    await expect(entries).toHaveCount(4);
    await expect(entries.first().locator('.proj-visual')).toBeVisible();
    await expect(entries.first().locator('.proj-body')).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);

    const firstEntry = await entries.first().evaluate((node) => {
      const visual = node.querySelector<HTMLElement>('.proj-visual')?.getBoundingClientRect();
      const body = node.querySelector<HTMLElement>('.proj-body')?.getBoundingClientRect();
      return { visualBottom: visual?.bottom ?? 0, bodyTop: body?.top ?? 0 };
    });
    expect(firstEntry.bodyTop).toBeGreaterThanOrEqual(firstEntry.visualBottom);
  });
});

test.describe('Footer edge popover', () => {
  // The longest network name the edge API has actually returned. It is what
  // wrapped the row, grew the popover past the footer's top edge, and got
  // cropped there while the footer was paint-contained.
  const EDGE_INFO = {
    colo: 'MEL',
    country: 'AU',
    city: 'Melbourne',
    region: 'Victoria',
    protocol: 'HTTP/3',
    tls: 'TLSv1.3',
    rtt: 0,
    network: 'SUPERLOOP (AUSTRALIA) PTY LTD',
  };

  async function stubEdge(page: Page): Promise<void> {
    await page.route('**/api/footer', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'x-cloudflare-colo': 'MEL' },
        body: JSON.stringify({ status: 'operational' }),
      });
    });
    await page.route('**/api/edge', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(EDGE_INFO),
      });
    });
  }

  // The home page paints the footer directly; the blog nests it in a scroll
  // container. The popover renders in the top layer, so neither can crop it.
  for (const path of ['/', '/blog']) {
    test(`paints every row clear of the footer box on ${path}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await stubEdge(page);
      await page.goto(path);

      const trigger = page.locator('[data-footer-region-trigger]');
      await trigger.scrollIntoViewIfNeeded();
      await expect(trigger).toBeVisible();
      await trigger.hover();

      const pop = page.locator('[data-footer-edge-pop]');
      await expect(pop).toBeVisible();
      await expect(pop.locator('.footer-edge-row')).toHaveCount(5);

      const painted = await page.evaluate(() => {
        const el = document.querySelector<HTMLElement>('[data-footer-edge-pop]');
        if (!el) return null;
        const box = el.getBoundingClientRect();
        const rows = Array.from(el.querySelectorAll<HTMLElement>('.footer-edge-row'));
        const rowPaints = (row: HTMLElement | undefined) => {
          if (!row) return false;
          const rowBox = row.getBoundingClientRect();
          const painted = document.elementFromPoint(
            rowBox.left + rowBox.width / 2,
            rowBox.top + rowBox.height / 2
          );
          return row.contains(painted);
        };
        return {
          insideViewport:
            box.top >= 0 &&
            box.left >= 0 &&
            box.right <= window.innerWidth &&
            box.bottom <= window.innerHeight,
          firstRow: rowPaints(rows[0]),
          lastRow: rowPaints(rows.at(-1)),
        };
      });

      expect(painted).toEqual({ insideViewport: true, firstRow: true, lastRow: true });
    });
  }

  test('keeps click, keyboard, and Escape state in sync', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await stubEdge(page);
    await page.goto('/');

    const trigger = page.locator('[data-footer-region-trigger]');
    const pop = page.locator('[data-footer-edge-pop]');
    await trigger.scrollIntoViewIfNeeded();
    await expect(trigger).toBeVisible();

    await trigger.click();
    await expect(pop).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await page.mouse.move(0, 0);
    await expect(pop).toBeVisible();

    await trigger.click();
    await expect(pop).toBeHidden();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await trigger.click();
    await expect(pop).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await page.mouse.click(0, 0);
    await expect(pop).toBeHidden();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await trigger.focus();
    await expect(pop).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(pop).toBeHidden();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await page.keyboard.press('Enter');
    await expect(pop).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(pop).toBeHidden();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  test('repositions inside a narrow and short viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await stubEdge(page);
    await page.goto('/');

    const trigger = page.locator('[data-footer-region-trigger]');
    const pop = page.locator('[data-footer-edge-pop]');
    await trigger.scrollIntoViewIfNeeded();
    await trigger.focus();
    await expect(pop.locator('.footer-edge-row')).toHaveCount(5);

    await page.setViewportSize({ width: 200, height: 100 });
    await expect.poll(async () =>
      pop.evaluate((el) => {
        const box = el.getBoundingClientRect();
        return (
          box.left >= 12 &&
          box.top >= 12 &&
          box.right <= window.innerWidth - 12 &&
          box.bottom <= window.innerHeight - 12
        );
      })
    ).toBe(true);
  });
});
