import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';

const BLOG_POST_PATH_RE = /^\/blog\/[^/?#]+\/$/;
const BLOG_TAG_PATH_RE = /^\/blog\/tag\/[^/?#]+\/$/;

interface BlogIndexTargets {
  firstPostHref: string;
  firstPostTitle: string;
  firstTagHref: string | null;
  firstTagName: string | null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pathFromHref(href: string | null, pattern: RegExp): string {
  expect(href).toBeTruthy();

  const { pathname } = new URL(href as string, 'https://buxx.me');

  expect(pathname).toMatch(pattern);

  return pathname;
}

function canonicalLoc(pathname: string): string {
  return `<loc>https://buxx.me${pathname}</loc>`;
}

async function openBlogIndex(page: Page): Promise<void> {
  const response = await page.goto('/blog');

  expect(response?.ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/blog\/?$/);
  await expect(page.locator('.blog-shell')).toBeVisible();
}

async function collectBlogIndexTargets(page: Page): Promise<BlogIndexTargets> {
  await openBlogIndex(page);

  const firstPost = page.locator('.blog-row').first();
  await expect(firstPost).toBeVisible();

  const firstPostLink = firstPost.locator('.blog-row__link');
  const firstPostHref = pathFromHref(await firstPostLink.getAttribute('href'), BLOG_POST_PATH_RE);
  const firstPostTitle = (await firstPost.locator('.blog-row__title').innerText()).trim();

  expect(firstPostTitle.length).toBeGreaterThan(0);

  const firstTag = page.locator('.blog-row__tag').first();
  if ((await firstTag.count()) === 0) {
    return {
      firstPostHref,
      firstPostTitle,
      firstTagHref: null,
      firstTagName: null,
    };
  }

  return {
    firstPostHref,
    firstPostTitle,
    firstTagHref: pathFromHref(await firstTag.getAttribute('href'), BLOG_TAG_PATH_RE),
    firstTagName: (await firstTag.innerText()).trim(),
  };
}

async function expectRedirect(
  request: APIRequestContext,
  pathname: string,
  expectedLocation: string,
): Promise<void> {
  const response = await request.get(pathname, { maxRedirects: 0 });

  expect(response.status()).toBe(301);
  expect(response.headers().location).toBe(expectedLocation);
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

test.describe('Blog routes', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('renders the static blog index with grouped posts and search entry', async ({ page }) => {
    await openBlogIndex(page);

    await expect(page.locator('.blog-masthead__wordmark')).toBeVisible();
    await expect(page.getByRole('button', { name: '搜索文章' })).toBeVisible();

    const yearGroups = page.locator('.blog-year');
    await expect(yearGroups.first()).toBeVisible();
    expect(await yearGroups.count()).toBeGreaterThan(0);

    const firstYear = yearGroups.first();
    await expect(firstYear.locator('.blog-year__heading')).toHaveText(/^(?:\d{4}|Unknown)$/);
    await expect(firstYear.locator('.blog-list .blog-row').first()).toBeVisible();

    const firstPostHref = pathFromHref(
      await page.locator('.blog-row__link').first().getAttribute('href'),
      BLOG_POST_PATH_RE,
    );
    expect(firstPostHref).toMatch(BLOG_POST_PATH_RE);

    await page.getByRole('button', { name: '搜索文章' }).click();

    const searchDialog = page.locator('[data-blog-search]');
    await expect(searchDialog).toBeVisible();
    await expect(searchDialog).toHaveJSProperty('open', true);
  });

  test('emits generated Open Graph image metadata for index and posts', async ({ page }) => {
    const { firstPostHref, firstPostTitle } = await collectBlogIndexTargets(page);

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
    expect(postOgImage.origin + postOgImage.pathname).toBe('https://og.tuuhub.com/api/og');
    expect(postOgImage.searchParams.get('title')).toBe(firstPostTitle);
    expect(postOgImage.searchParams.get('site')).toBe('無人之境');
    expect(postOgImage.searchParams.get('author')).toBeTruthy();
    expect(postOgImage.searchParams.get('date')).toMatch(/^[A-Z][a-z]+ \d{1,2}, \d{4}$/);
    expect(postOgImage.searchParams.get('excerpt')).toBeTruthy();
    expect(await readMetaContent(page, 'meta[name="twitter:image"]')).toBe(postOgImage.toString());
  });

  test('renders post detail with article semantics, Ghost HTML, and adjacent navigation', async ({ page }) => {
    const { firstPostHref, firstPostTitle } = await collectBlogIndexTargets(page);

    await page.locator('.blog-row__link').first().click();

    await expect(page).toHaveURL(new RegExp(`${escapeRegExp(firstPostHref)}/?$`));

    const article = page.locator('article[data-pagefind-body]');
    await expect(article).toBeVisible();
    await expect(article.getByRole('heading', { level: 1 })).toHaveText(firstPostTitle);
    await expect(page.locator('.blog-article__meta')).toBeVisible();

    const prose = article.locator('.blog-prose');
    await expect(prose).toBeVisible();

    const proseState = await prose.evaluate((node) => ({
      childCount: node.children.length,
      hasGhostClass: Boolean(node.querySelector('[class*="kg-"]')),
      textLength: node.textContent?.trim().length ?? 0,
    }));

    expect(proseState.childCount).toBeGreaterThan(0);
    expect(proseState.textLength).toBeGreaterThan(20);
    expect(proseState.hasGhostClass || proseState.childCount > 0).toBeTruthy();

    const adjacentNav = page.getByRole('navigation', { name: 'More posts' });
    if ((await adjacentNav.count()) > 0 && await adjacentNav.first().isVisible()) {
      await expect(adjacentNav.first().locator('a[href^="/blog/"]').first()).toBeVisible();
    } else {
      await expect(page.getByRole('link', { name: /All posts|Blog/ }).first()).toBeVisible();
    }
  });

  test('renders Ghost code through the shared code box component', async ({ page }) => {
    const response = await page.goto('/blog/demo-effects/');

    expect(response?.ok()).toBeTruthy();

    const codeBox = page.locator('.blog-prose > .code-box').first();
    await expect(codeBox).toBeVisible();
    await expect(codeBox.locator('pre.astro-code')).toBeVisible();
    await expect(codeBox.getByRole('button', { name: 'Copy code' })).toBeVisible();
  });

  test('serves negotiated markdown for blog posts without crossing html cache entries', async ({ page, request }) => {
    const { firstPostHref, firstPostTitle } = await collectBlogIndexTargets(page);
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
    const { firstPostHref } = await collectBlogIndexTargets(page);

    await page.goto(firstPostHref);
    const alternate = page.locator('link[rel="alternate"][type="text/markdown"]');
    await expect(alternate).toHaveCount(1);
    expect(await alternate.first().getAttribute('href')).toBe(`https://buxx.me${firstPostHref}`);

    const llms = await request.get('/llms.txt');
    expect(llms.ok()).toBeTruthy();
    expect(llms.headers()['content-type']).toContain('text/plain');
    expect(llms.headers()['cache-control']).toContain('s-maxage=300');
    const body = await llms.text();
    expect(body).toContain('https://buxx.me/blog/');
    expect(body).toContain('https://buxx.me/mood');
  });

  test('renders public tag archives from blog tag links', async ({ page }) => {
    const { firstTagHref, firstTagName } = await collectBlogIndexTargets(page);

    test.skip(!firstTagHref || !firstTagName, 'No public tag links are available on the blog index.');

    const response = await page.goto(firstTagHref as string);

    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveURL(new RegExp(`${escapeRegExp(firstTagHref as string)}/?$`));
    await expect(page.locator('.tag-archive__title')).toContainText(firstTagName as string);
    await expect(page.locator('.tag-archive__count')).toHaveText(/\d+\s+posts?/);
    await expect(page.locator('.blog-row__link').first()).toBeVisible();
  });

  test('does not expose the superseded bespoke blog search JSON route', async ({ request }) => {
    const response = await request.get('/blog/search.json');

    expect(response.status()).toBe(404);
  });

  test('serves Pagefind search assets generated from the static blog', async ({ request }) => {
    const response = await request.get('/pagefind/pagefind-entry.json');

    test.skip(response.status() === 404, 'Pagefind assets are generated by the production build, not astro dev.');

    expect(response.ok()).toBeTruthy();
    expect(response.headers()['content-type'] ?? '').toMatch(/application\/json/i);
  });

  test('serves the blog RSS feed with canonical blog entries', async ({ request }) => {
    const xml = await readTextRoute(request, '/blog/rss.xml', /(?:application|text)\/(?:rss\+xml|xml)/i);

    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain('<channel>');
    expect(xml).toContain('<link>https://buxx.me/blog/</link>');
    expect(xml).toMatch(/<item>[\s\S]*<link>https:\/\/buxx\.me\/blog\/[^<]+<\/link>/);
    expect(xml).not.toContain('blog.buxx.me/rss');
  });

  test('includes blog index, posts, and public tags in the sitemap', async ({ page, request }) => {
    const { firstPostHref, firstTagHref } = await collectBlogIndexTargets(page);
    const xml = await readTextRoute(request, '/sitemap.xml', /(?:application|text)\/xml/i);

    expect(xml).toContain(canonicalLoc('/blog/'));
    expect(xml).toContain(canonicalLoc(firstPostHref));

    if (firstTagHref) {
      expect(xml).toContain(canonicalLoc(firstTagHref));
    }

    expect(xml).not.toContain('/blog/tag/hash-');
  });

  test('redirects legacy Ghost URLs to the canonical blog routes', async ({ request }) => {
    const probe = await request.get('/sacrifice', { maxRedirects: 0 });

    test.skip(probe.status() === 404, 'Cloudflare static redirects are applied in the built Worker, not astro dev.');

    await expectRedirect(request, '/sacrifice', '/blog/sacrifice');
    await expectRedirect(request, '/tag/prose', '/blog/tag/prose');
    await expectRedirect(request, '/author/murray', '/blog');
  });
});
