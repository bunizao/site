import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';

// The newest listed post in the mock fixture (src/features/posts/adapter/mock.ts)
// and its older neighbour. The newest has no newer one.
const NEWEST_POST = { path: '/blog/demo-effects', title: 'Astro migration effect sandbox' };
const OLDER_POST_PATH = '/blog/quiet-architecture';

async function readPageScrollTop(page: Page): Promise<number> {
  return page.locator('html').evaluate((scroller) => scroller.scrollTop);
}

async function openBlogIndex(page: Page): Promise<void> {
  const response = await page.goto('/blog');

  expect(response?.ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/blog$/);
  await expect(page.locator('.blog-shell')).toBeVisible();
}

async function readTextRoute(
  request: APIRequestContext,
  pathname: string,
  contentTypePattern: RegExp,
): Promise<string> {
  const response = await request.get(pathname);

  expect(response.ok()).toBeTruthy();
  expect(response.headers()['content-type'] ?? '').toMatch(contentTypePattern);

  return response.text();
}

async function readMetaContent(page: Page, selector: string): Promise<string> {
  const content = await page.locator(selector).first().getAttribute('content');

  expect(content).toBeTruthy();

  return content as string;
}

test.describe('Blog wordmark', () => {
  test('stays static on hover', async ({ page }) => {
    await openBlogIndex(page);

    const wordmark = page.locator('[data-site-wordmark-variant="blog"]');
    await wordmark.evaluate(async (element) => {
      await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished));
    });
    const before = await wordmark.evaluate((element) => {
      const latin = element.querySelector<HTMLElement>('.site-wordmark__latin');
      const wake = element.querySelector<HTMLElement>('.site-wordmark__wake');
      return {
        letterSpacing: latin ? getComputedStyle(latin).letterSpacing : '',
        backgroundPosition: wake ? getComputedStyle(wake).backgroundPosition : '',
      };
    });

    await wordmark.hover();
    await page.waitForTimeout(100);

    const after = await wordmark.evaluate((element) => {
      const latin = element.querySelector<HTMLElement>('.site-wordmark__latin');
      const wake = element.querySelector<HTMLElement>('.site-wordmark__wake');
      return {
        letterSpacing: latin ? getComputedStyle(latin).letterSpacing : '',
        backgroundPosition: wake ? getComputedStyle(wake).backgroundPosition : '',
      };
    });
    expect(after).toEqual(before);
  });

  test('fits the content column at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await openBlogIndex(page);

    const shell = page.locator('.blog-shell');
    const shellBox = await shell.boundingBox();
    const wordmarkBox = await page.locator('[data-site-wordmark-variant="blog"]').boundingBox();
    const padding = await shell.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        left: Number.parseFloat(style.paddingLeft),
        right: Number.parseFloat(style.paddingRight),
      };
    });
    expect(shellBox).not.toBeNull();
    expect(wordmarkBox).not.toBeNull();
    expect(wordmarkBox!.x).toBeGreaterThanOrEqual(shellBox!.x + padding.left);
    expect(wordmarkBox!.x + wordmarkBox!.width).toBeLessThanOrEqual(
      shellBox!.x + shellBox!.width - padding.right,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  });

  test.describe('under increased contrast', () => {
    test.use({ contrast: 'more' });

    test('lifts the wake to the stronger foreground alpha', async ({ page }) => {
      await openBlogIndex(page);

      const token = await page
        .locator('[data-site-wordmark-variant="blog"]')
        .evaluate((element) => getComputedStyle(element).getPropertyValue('--wordmark-wake-rest').trim());

      // Chromium serialises the alpha without its leading zero.
      expect(token).toMatch(/\/\s*0?\.82\s*\)/);
    });
  });
});

test.describe('Blog routes', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('groups listed posts by year on the static index', async ({ page }) => {
    await openBlogIndex(page);

    await expect(page.locator('.blog-masthead__wordmark')).toBeVisible();
    await expect(page.locator('[data-site-wordmark-variant="blog"] .site-wordmark__cjk')).toHaveText('無人之境');
    await expect(page.locator('[data-site-wordmark-variant="blog"] .site-wordmark__wake')).toHaveText('sillage');

    // Every fixture post is from 2026, newest first.
    const firstYear = page.locator('.blog-year').first();
    await expect(firstYear.locator('.blog-year__heading')).toHaveText('2026');
    await expect(firstYear.locator('.blog-list .blog-row__link').first()).toHaveAttribute('href', NEWEST_POST.path);

    await expect(page.locator('.blog-colophon')).toHaveCount(0);
  });

  test('folds older posts behind "earlier" and the year links, under the writing ledger', async ({ page }) => {
    await openBlogIndex(page);

    const rows = page.locator('.blog-row');
    const visible = page.locator('.blog-row:not([hidden])');
    const total = await rows.count();
    const shown = await visible.count();
    expect(shown).toBe(Math.min(total, 8));

    const earlier = page.locator('[data-blog-earlier]');
    if (total > shown) {
      await expect(earlier).toContainText(`${total - shown}`);
      await earlier.click();
      expect(await visible.count()).toBe(Math.min(total, shown + 8));
    } else {
      await expect(earlier).toHaveCount(0);
    }

    const ledger = page.locator('.blog-ledger');
    await expect(ledger.locator('.blog-ledger__stats')).toContainText(/\d+ 篇/);
    // One strip of months from the first January to now, one label a year.
    const years = await ledger.locator('.blog-ledger__year').count();
    const months = await ledger.locator('.blog-ledger__month').count();
    expect(months).toBeGreaterThan((years - 1) * 12);
    expect(months).toBeLessThanOrEqual(years * 12);

    // Hovering a written month opens a card naming its posts, which stays
    // while the pointer climbs into it, and closes once it leaves the ledger.
    const bar = ledger.locator('.blog-ledger__month.is-written').first();
    await bar.scrollIntoViewIfNeeded();
    await bar.hover();
    const card = ledger.locator('.blog-ledger__card:not([hidden])');
    await expect(card).toHaveCount(1);
    await expect(card.locator('.blog-ledger__card-note')).toContainText(/\d+ 篇/);
    const link = card.locator('a').first();
    await link.hover();
    await expect(card).toHaveCount(1);
    await page.mouse.move(0, 0);
    await expect(card).toHaveCount(0);

    // The oldest year's label unfolds every post down to it.
    const oldest = ledger.locator('a.blog-ledger__year').first();
    const year = (await oldest.innerText()).trim();
    await oldest.click();
    await expect(page.locator(`#y${year}`)).toBeVisible();
    await expect(page.locator(`#y${year} .blog-row`).last()).toBeVisible();
    await expect(earlier).toBeHidden();
  });

  test('holds the sea footer still under reduced motion and lets it be played with otherwise', async ({ page }) => {
    const response = await page.goto('/blog?sea=dusk');
    expect(response?.ok()).toBeTruthy();

    // Assert the layer order, not just presence: the boat has to sit between
    // the two seas so the near one hides its hull, the white water has to lie
    // on top of the water it breaks from, and the front row goes in front of
    // all of it.
    const sea = page.locator('.sillage-sea');
    await expect(sea).toHaveAttribute('aria-hidden', 'true');
    const layers = (el: Element) =>
      Array.from(el.children, (child) => child.className.replace('sillage-sea__', '')).filter(
        (layer) => layer !== 'foam',
      );
    expect(await sea.evaluate(layers)).toEqual(['dusk', 'sun', 'clouds', 'back', 'boat', 'near', 'glitter', 'wake', 'front']);
    expect(await sea.locator('.sillage-sea__wake').evaluate(layers)).toEqual(['bow', 'churn', 'glint']);

    // The art loads only once the band is in view. Dusk, on request here and
    // by the reader's clock otherwise, is its own set.
    await page.locator('html').evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect(sea).toHaveAttribute('data-seen', '');
    await expect(sea).toHaveAttribute('data-dusk', '');
    await expect(sea.locator('.sillage-sea__near')).toHaveCSS('background-image', /\/sillage\/dusk-(?:light|dark)\/near\.webp/);
    await expect(sea.locator('.sillage-sea__dusk')).toHaveCSS('background-image', /\/sillage\/dusk-(?:light|dark)\/sky\.webp/);

    // Under reduced motion the sea stands still and a touch does nothing. A
    // sea that cannot be touched never sounds, so it has no sound switch.
    let band = (await sea.boundingBox())!;
    let waterY = band.y + band.height - 24;
    await page.mouse.click(band.x + band.width * 0.7, waterY);
    await expect(sea.locator('.sillage-sea__splash')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Sound of the sea' })).toBeHidden();
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    // Scroll runs on into the sea: past the end of the page, a wheel keeps
    // driving the water. The sea stays silent, and fetches no surf, until it
    // is touched.
    const nearRate = () =>
      sea.locator('.sillage-sea__near').evaluate((el) => el.getAnimations()[0].playbackRate);
    const sounds: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/sillage/sound/')) sounds.push(new URL(request.url()).pathname);
    });
    band = (await sea.boundingBox())!;
    waterY = band.y + band.height - 24;
    await page.mouse.move(band.x + band.width * 0.5, band.y - 120);
    await page.mouse.wheel(0, 600);
    await expect.poll(nearRate).toBeGreaterThan(1);
    expect(sounds).not.toContain('/sillage/sound/surf.m4a');

    // The first touch of the water splashes, opens the sound and always
    // brings a dolphin up.
    await page.mouse.click(band.x + band.width * 0.7, waterY);
    await expect(sea.locator('.sillage-sea__splash').first()).toBeAttached();
    await expect(sea.locator('.sillage-sea__dolphin')).toBeAttached();
    await expect.poll(() => sounds).toContain('/sillage/sound/surf.m4a');

    // A sideways drag takes hold of the sea and drives it faster than its own
    // pace.
    await page.mouse.move(band.x + band.width * 0.8, waterY);
    await page.mouse.down();
    await page.mouse.move(band.x + band.width * 0.44, waterY, { steps: 12 });
    await expect(sea).toHaveAttribute('data-held', '');
    await expect.poll(nearRate).toBeGreaterThan(1);
    await page.mouse.up();
    await expect(sea).not.toHaveAttribute('data-held', '');

    // The boat can be picked up out of the water, and falls back when let go.
    const boat = sea.locator('.sillage-sea__boat');
    const hull = (await boat.boundingBox())!;
    const lift = async () =>
      boat.evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42);
    await page.mouse.move(hull.x + hull.width / 2, hull.y + hull.height * 0.6);
    await page.mouse.down();
    await page.mouse.move(hull.x + hull.width / 2, hull.y + hull.height * 0.6 - 50, { steps: 10 });
    await expect(sea).toHaveAttribute('data-held', '');
    await expect.poll(lift).toBeLessThan(-20);
    await page.mouse.up();
    await expect.poll(lift, { timeout: 5000 }).toBeGreaterThan(-3);

    // The sound switch, shown once motion is allowed: pressed means on, and
    // off is remembered.
    await page.reload();
    const toggle = page.getByRole('button', { name: 'Sound of the sea' });
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await page.reload();
    await expect(page.getByRole('button', { name: 'Sound of the sea' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('keeps the hover cover and indicator aligned during wheel scrolling', async ({ page }) => {
    await page.route('**/mock/*.svg', async (route) => {
      await route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="10"></svg>',
      });
    });
    await openBlogIndex(page);

    const list = page.locator('.blog-list').filter({ has: page.locator('.blog-row[data-hero]') }).first();
    const rows = list.locator('.blog-row[data-hero]');
    expect(await rows.count()).toBeGreaterThanOrEqual(2);

    const currentRow = rows.nth(0);
    const nextRow = rows.nth(1);
    await currentRow.scrollIntoViewIfNeeded();

    const currentBox = await currentRow.boundingBox();
    const nextBox = await nextRow.boundingBox();
    expect(currentBox).not.toBeNull();
    expect(nextBox).not.toBeNull();

    const pointer = {
      x: currentBox!.x + currentBox!.width / 2,
      y: currentBox!.y + currentBox!.height / 2,
    };
    const wheelDelta = Math.round(nextBox!.y + nextBox!.height / 2 - pointer.y);
    expect(wheelDelta).toBeGreaterThan(0);

    await page.mouse.move(pointer.x, pointer.y);
    const preview = page.locator('.blog-preview');
    await expect(preview).toHaveClass(/is-visible/);

    const expectedHero = await nextRow.getAttribute('data-hero');
    expect(expectedHero).toBeTruthy();
    const initialScrollY = await readPageScrollTop(page);
    await page.mouse.wheel(0, wheelDelta);

    await expect.poll(async () => page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest<HTMLElement>('.blog-row')?.dataset.hero ?? null,
      pointer,
    )).toBe(expectedHero);
    expect(await readPageScrollTop(page)).toBeGreaterThan(initialScrollY);
    await expect(preview.locator('img')).toHaveAttribute('src', expectedHero!);
    await expect(preview).toHaveClass(/is-visible/);

    const indicator = list.locator('.blog-indicator');
    await expect(indicator).toHaveCSS('opacity', '1');
    await expect.poll(async () => page.evaluate(({ x, y }) => {
      const row = document.elementFromPoint(x, y)?.closest<HTMLElement>('.blog-row');
      const pill = row?.closest('.blog-list')?.querySelector<HTMLElement>('.blog-indicator');
      if (!row || !pill) return Number.POSITIVE_INFINITY;

      const rowRect = row.getBoundingClientRect();
      const pillRect = pill.getBoundingClientRect();
      return Math.abs(
        pillRect.top + pillRect.height / 2 - (rowRect.top + rowRect.height / 2),
      );
    }, pointer)).toBeLessThan(3);

    const pageHeight = await page.locator('html').evaluate((scroller) => scroller.scrollHeight);
    await page.mouse.wheel(0, pageHeight);
    await expect.poll(async () => page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest('.blog-list') !== null,
      pointer,
    )).toBe(false);
    await expect(preview).not.toHaveClass(/is-visible/);
    await expect(indicator).toHaveCSS('opacity', '0');
    await expect(list).not.toHaveClass(/is-hovering/);
  });

  test('emits generated Open Graph image metadata for index and posts', async ({ page }) => {
    const { path: firstPostHref, title: firstPostTitle } = NEWEST_POST;
    await openBlogIndex(page);

    await expect(page).toHaveTitle("無人之境 — Lucian's Blog");
    const indexOgImage = new URL(await readMetaContent(page, 'meta[property="og:image"]'));
    expect(indexOgImage.toString()).toBe('https://buxx.me/blog-og.jpg');
    expect(await readMetaContent(page, 'meta[property="og:image:width"]')).toBe('1200');
    expect(await readMetaContent(page, 'meta[property="og:image:height"]')).toBe('630');
    expect(await readMetaContent(page, 'meta[name="twitter:image"]')).toBe(indexOgImage.toString());

    const response = await page.goto(firstPostHref);

    expect(response?.ok()).toBeTruthy();

    const postOgImage = new URL(await readMetaContent(page, 'meta[property="og:image"]'));
    expect(await readMetaContent(page, 'meta[property="og:type"]')).toBe('article');
    expect(await readMetaContent(page, 'meta[property="article:published_time"]')).toBeTruthy();
    expect(await readMetaContent(page, 'meta[property="article:author"]')).toBeTruthy();
    await expect(page).toHaveTitle(firstPostTitle);
    expect(await readMetaContent(page, 'meta[property="og:title"]')).toBe(firstPostTitle);
    expect(postOgImage.origin + postOgImage.pathname).toBe('https://og.tuuhub.com/api/og');
    expect(postOgImage.searchParams.get('title')).toBe(firstPostTitle);
    expect(postOgImage.searchParams.get('site')).toBe('無人之境');
    expect(postOgImage.searchParams.get('author')).toBeTruthy();
    expect(postOgImage.searchParams.get('date')).toMatch(/^[A-Z][a-z]+ \d{1,2}, \d{4}$/);
    expect(postOgImage.searchParams.get('excerpt')).toBeTruthy();
    expect(await readMetaContent(page, 'meta[name="twitter:image"]')).toBe(postOgImage.toString());

    const blogPosting = await page.locator('script[type="application/ld+json"]').evaluateAll((scripts) => {
      return scripts
        .map((script) => JSON.parse(script.textContent ?? '{}'))
        .find((item) => item['@type'] === 'BlogPosting');
    });
    expect(blogPosting).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: firstPostTitle,
      url: `https://buxx.me${firstPostHref}`,
      publisher: {
        '@type': 'Organization',
        name: '無人之境',
        url: 'https://buxx.me/blog',
        logo: {
          '@type': 'ImageObject',
          width: 128,
          height: 128,
        },
      },
    });
  });

  test('links each post to its chronological neighbours', async ({ page }) => {
    await openBlogIndex(page);
    await page.locator('.blog-row__link').first().click();

    await expect(page).toHaveURL(/\/blog\/demo-effects$/);
    const article = page.locator('article[data-pagefind-body]');
    await expect(article.getByRole('heading', { level: 1 })).toHaveText(NEWEST_POST.title);
    await expect(article.locator('.blog-prose')).toBeVisible();

    // The newest post has no newer neighbour, so that side leads back to the index.
    const adjacentNav = page.getByRole('navigation', { name: 'More posts' });
    await expect(adjacentNav.locator('.blog-adjacent__item--prev')).toHaveAttribute('href', OLDER_POST_PATH);
    await expect(adjacentNav.locator('.blog-adjacent__item--next')).toHaveCount(0);
    await expect(adjacentNav.locator('.blog-adjacent__index--next')).toHaveAttribute('href', '/blog');
  });

  test('keeps an unlisted post direct-only and excluded from crawlers and Pagefind', async ({ page }) => {
    await page.goto('/blog/private-link-demo');

    await expect(page).toHaveTitle(/Direct link only fixture/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow, noarchive, nosnippet',
    );
    await expect(page.locator('body')).toHaveAttribute('data-pagefind-ignore', 'all');
    await expect(page.locator('link[rel="alternate"][type="text/markdown"]')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'More posts' })).toHaveCount(0);

    await page.goto('/blog');
    await expect(page.getByText('Direct link only fixture')).toHaveCount(0);
  });

  test('renders model credits from post metadata without leaking the carrier or overflowing', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });

    const response = await page.goto('/blog/demo-effects');

    expect(response?.ok()).toBeTruthy();

    const prose = page.locator('.blog-prose');
    const credits = page.locator('.ai-credit');
    await expect(credits).toBeVisible();
    await expect(page.locator('.not-by-ai')).toHaveCount(0);
    await expect(prose).not.toContainText('[!authors');
    await expect(credits.locator('.ai-credit__sig')).toHaveCount(1);
    await expect(credits.locator('.ai-credit__sig')).toContainText('Claude Opus 4.6');
    await expect(credits).toContainText('produced the first draft, translated it from Chinese.');

    const creditBounds = await credits.boundingBox();
    expect(creditBounds).not.toBeNull();
    expect(creditBounds!.x).toBeGreaterThanOrEqual(0);
    expect(creditBounds!.x + creditBounds!.width).toBeLessThanOrEqual(321);

    await page.goto('/blog/quiet-architecture');
    await expect(page.locator('.not-by-ai')).toHaveText('本文由真人撰写，未使用 AI 创作。');
    await expect(page.locator('.ai-credit')).toHaveCount(0);
    await expect(page.locator('.not-by-ai__trigger, .not-by-ai__card')).toHaveCount(0);
  });

  test('renders Ghost code through the shared code box component', async ({ page }) => {
    const response = await page.goto('/blog/demo-effects');

    expect(response?.ok()).toBeTruthy();

    const codeBox = page.locator('.blog-prose > .code-box').first();
    await expect(codeBox).toBeVisible();
    await expect(codeBox.locator('pre.astro-code')).toBeVisible();
    await expect(codeBox.getByRole('button', { name: 'Copy code' })).toBeVisible();
  });

  // The Instant View template in config/instant-view/buxx.me.iv addresses these
  // selectors by name, and Telegram parses the published page rather than
  // anything this repo can assert against. The site no longer hands Telegram a
  // link itself, but the template still applies to any post pasted into a chat,
  // so the contract is pinned here: fix the template alongside a rename.
  test('keeps the structure the Telegram Instant View template addresses', async ({ page }) => {
    const response = await page.goto('/blog/demo-effects');

    expect(response?.ok()).toBeTruthy();

    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article');
    await expect(page.locator('meta[property="article:published_time"]')).toHaveCount(1);
    await expect(page.locator('meta[property="article:author"]')).toHaveCount(1);

    await expect(page.locator('h1.blog-article__title')).toBeVisible();
    await expect(page.locator('.blog-prose')).toBeVisible();

    // Article body only: the template takes .blog-prose as the Instant View
    // body precisely because the colophon and the comment thread sit outside
    // it, and nothing it cannot render has to be removed rule by rule.
    await expect(page.locator('.blog-prose .blog-colophon')).toHaveCount(0);
    await expect(page.locator('.blog-prose .blog-comments')).toHaveCount(0);

    const codeBox = page.locator('.blog-prose > .code-box').first();
    await expect(codeBox.locator('.code-box-body > pre')).toHaveCount(1);
  });

  test('serves negotiated markdown for blog posts without crossing html cache entries', async ({ request }) => {
    const { path: firstPostHref, title: firstPostTitle } = NEWEST_POST;
    const cacheProbePath = `${firstPostHref}?agent-cache=e2e`;

    const markdown = await request.get(firstPostHref, {
      headers: { Accept: 'text/markdown' },
    });
    expect(markdown.ok()).toBeTruthy();
    expect(markdown.headers()['content-type']).toContain('text/markdown');
    expect(markdown.headers()['x-markdown-tokens']).toBeTruthy();
    expect(markdown.headers().vary ?? '').toContain('Accept');
    expect(await markdown.text()).toContain(`# ${firstPostTitle}`);

    const html = await request.get(firstPostHref, {
      headers: { Accept: 'text/html' },
    });
    expect(html.ok()).toBeTruthy();
    expect(html.headers()['content-type']).toContain('text/html');
    expect(html.headers().vary ?? '').toContain('Accept');
    expect(await html.text()).toContain('<!DOCTYPE html>');

    const miss = await request.get(cacheProbePath, {
      headers: { Accept: 'text/markdown' },
    });
    const hit = await request.get(cacheProbePath, {
      headers: { Accept: 'text/markdown' },
    });
    expect(miss.headers()['x-buxx-edge-cache']).toBe('MISS');
    expect(hit.headers()['x-buxx-edge-cache']).toBe('HIT');
    expect(hit.headers()['content-type']).toContain('text/markdown');

    const htmlProbe = await request.get(cacheProbePath, {
      headers: { Accept: 'text/html' },
    });
    expect(htmlProbe.headers()['content-type']).toContain('text/html');
  });

  test('advertises markdown alternates and llms discovery', async ({ page, request }) => {
    await page.goto(NEWEST_POST.path);
    const alternate = page.locator('link[rel="alternate"][type="text/markdown"]');
    await expect(alternate).toHaveCount(1);
    expect(await alternate.first().getAttribute('href'))
      .toBe(`https://buxx.me${NEWEST_POST.path}/index.md`);

    const explicitMarkdown = await request.get(`${NEWEST_POST.path}/index.md`);
    expect(explicitMarkdown.ok()).toBeTruthy();
    expect(explicitMarkdown.headers()['content-type']).toContain('text/markdown');

    const llms = await request.get('/llms.txt');
    expect(llms.ok()).toBeTruthy();
    expect(llms.headers()['content-type']).toContain('text/plain');
    expect(llms.headers()['cache-control']).toContain('s-maxage=300');
    const body = await llms.text();
    expect(body).toContain('https://buxx.me/blog');
    expect(body).toContain('https://buxx.me/mood');
  });

  test('renders a public tag archive with its listed posts', async ({ page }) => {
    const response = await page.goto('/blog/tag/systems');

    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('.tag-archive__title')).toContainText('Systems');
    // Five listed fixture posts carry it; the unlisted, members-only and
    // translated ones that also do are left out.
    await expect(page.locator('.tag-archive__count')).toHaveText('5 posts');
    await expect(page.locator('.blog-row__link').first()).toHaveAttribute('href', NEWEST_POST.path);
  });

  test('serves the blog RSS feed with canonical blog entries', async ({ request }) => {
    const xml = await readTextRoute(request, '/blog/rss.xml', /(?:application|text)\/(?:rss\+xml|xml)/i);

    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain('<channel>');
    expect(xml).toContain('<link>https://buxx.me/blog</link>');
    expect(xml).toMatch(/<item>[\s\S]*<link>https:\/\/buxx\.me\/blog\/[^<]+<\/link>/);
    expect(xml).not.toContain('blog.buxx.me/rss');
  });
});
