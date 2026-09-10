import { describe, expect, test } from 'bun:test';

// blog.buxx.me is still the Ghost origin; only its public URLs moved to
// buxx.me/blog. Google keeps ranking whichever host answers 200 with a
// self-canonical, so every published Ghost URL must 301 straight to its
// buxx.me twin, and the Ghost surfaces the editor depends on must not.
// The rules live in Cloudflare (scripts/legacy-blog-redirects.ts); this probe
// is what turns a rule regression or a Ghost permalink change into a failure.

const LEGACY_ORIGIN = 'https://blog.buxx.me';
const SITE = 'https://buxx.me';
const TIMEOUT_MS = 10_000;

const PAGE_TARGETS: Record<string, string> = {
  '/links/': `${SITE}/blog`,
  '/tags/': `${SITE}/blog/tags`,
};

function contentApiKey(): string {
  return (process.env.GHOST_CONTENT_API_KEY ?? process.env.GHOST_CONTENT_APIKEY ?? '').trim();
}

async function listGhostUrls(resource: 'posts' | 'pages'): Promise<string[]> {
  const url = `${LEGACY_ORIGIN}/ghost/api/content/${resource}/?key=${contentApiKey()}&fields=url&limit=all`;
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  expect(response.ok, `GET ${resource} -> ${response.status}`).toBe(true);
  const payload = await response.json() as Record<string, Array<{ url: string }>>;
  return (payload[resource] ?? []).map((entry) => entry.url);
}

async function head(url: string): Promise<Response> {
  return fetch(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
}

async function expectPermanentRedirect(from: string, to: string): Promise<void> {
  const response = await head(from);
  expect(response.status, `${from} -> ${response.status}`).toBe(301);
  expect(response.headers.get('location'), `${from} Location`).toBe(to);
}

async function expectLandsOnSite(url: string): Promise<void> {
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
  expect(response.status, `${url} -> ${response.status}`).toBe(200);
  expect(new URL(response.url).hostname).toBe('buxx.me');
  const canonical = (await response.text()).match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? '';
  expect(canonical.startsWith(`${SITE}/blog`), `${url} canonical ${canonical}`).toBe(true);
}

describe('legacy blog host redirects', () => {
  test('the Content API key is configured', () => {
    expect(contentApiKey(), 'GHOST_CONTENT_API_KEY is required for this probe').not.toBe('');
  });

  test('every published Ghost post redirects once to its buxx.me twin', async () => {
    const urls = await listGhostUrls('posts');
    expect(urls.length).toBeGreaterThan(0);
    await Promise.all(urls.map(async (url) => {
      const pathname = new URL(url).pathname;
      // The shape rules cover one root segment; a permalink change breaks them.
      expect(pathname, `${url} is not a root-level permalink`).toMatch(/^\/[^/]+\/$/);
      const target = `${SITE}/blog${pathname.slice(0, -1)}`;
      await expectPermanentRedirect(url, target);
      await expectPermanentRedirect(url.slice(0, -1), target);
      await expectLandsOnSite(target);
    }));
  });

  test('every published Ghost page has an intentional destination', async () => {
    const urls = await listGhostUrls('pages');
    await Promise.all(urls.map(async (url) => {
      const target = PAGE_TARGETS[new URL(url).pathname];
      expect(target, `${url} has no mapping in PAGE_TARGETS; map it or unpublish it`).toBeDefined();
      await expectPermanentRedirect(url, target);
      await expectLandsOnSite(target);
    }));
  });

  test('the index, feeds and sitemaps land on their replacements', async () => {
    await expectPermanentRedirect(`${LEGACY_ORIGIN}/`, `${SITE}/blog`);
    await expectPermanentRedirect(`${LEGACY_ORIGIN}/rss/`, `${SITE}/blog/rss.xml`);
    await expectPermanentRedirect(`${LEGACY_ORIGIN}/sitemap.xml`, `${SITE}/sitemap.xml`);
    await expectPermanentRedirect(`${LEGACY_ORIGIN}/sitemap-posts.xml`, `${SITE}/sitemap.xml`);
    await expectPermanentRedirect(`${LEGACY_ORIGIN}/tag/prose/`, `${SITE}/blog/tag/prose`);
  });

  test('Ghost keeps its editor, APIs and member surfaces', async () => {
    const survivors = [
      `${LEGACY_ORIGIN}/ghost/`,
      `${LEGACY_ORIGIN}/ghost/api/content/settings/?key=${contentApiKey()}`,
      `${LEGACY_ORIGIN}/members/api/site/`,
      `${LEGACY_ORIGIN}/robots.txt`,
    ];
    await Promise.all(survivors.map(async (url) => {
      const response = await head(url);
      expect(response.status, `${url} -> ${response.status}`).toBe(200);
    }));
  });
});
