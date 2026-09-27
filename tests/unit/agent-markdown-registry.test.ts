import { describe, expect, test } from 'bun:test';

import {
  explicitMarkdownSourcePath,
  getContentRoutePolicy,
  getMarkdownRenderer,
  hasMarkdownRenderer,
  markdownAlternatePath,
} from '@/features/agent-markdown/server/registry';
import {
  cloudflareCdnCacheControl,
  isSsrOnlyPath,
  publicCacheControl,
  redirectCanonicalUrl,
  renderMarkdownIfRequested,
  withContentPolicy,
} from '@/features/agent-markdown/server/responses';

describe('agent markdown registry', () => {
  test('maps public pages to explicit index.md alternates', () => {
    expect(markdownAlternatePath('/')).toBe('/index.md');
    expect(markdownAlternatePath('/docs/writing/poem/')).toBe('/docs/writing/poem/index.md');
    expect(explicitMarkdownSourcePath('/index.md')).toBe('/');
    expect(explicitMarkdownSourcePath('/docs/writing/poem/index.md'))
      .toBe('/docs/writing/poem');
    expect(explicitMarkdownSourcePath('/docs/writing/poem')).toBeNull();
  });

  test('serves explicit index.md URLs without content negotiation', async () => {
    const response = await renderMarkdownIfRequested({
      request: new Request('https://buxx.me/privacy/index.md'),
      locals: {},
    });

    expect(response?.status).toBe(200);
    expect(response?.headers.get('Content-Type')).toContain('text/markdown');
    expect(response?.headers.get('Link')).toBe('<https://buxx.me/privacy>; rel="canonical"');
    expect(await response?.text()).toContain('# Privacy Policy');
  });

  test('redirects the www host to the apex in one hop', () => {
    const www = redirectCanonicalUrl(new Request('https://www.buxx.me/blog/sacrifice/?ref=tg'));
    expect(www?.status).toBe(301);
    expect(www?.headers.get('Location')).toBe('https://buxx.me/blog/sacrifice?ref=tg');
    expect(redirectCanonicalUrl(new Request('https://buxx.me/blog/sacrifice'))).toBeNull();
  });

  test('redirects alternate URL forms to slashless canonical paths', () => {
    const trailingSlash = redirectCanonicalUrl(
      new Request('https://buxx.me/docs/writing/authors/?view=full'),
    );
    const markdownShorthand = redirectCanonicalUrl(
      new Request('https://buxx.me/docs/writing/authors.md?view=full'),
    );

    expect(trailingSlash?.status).toBe(308);
    expect(trailingSlash?.headers.get('Location'))
      .toBe('/docs/writing/authors?view=full');
    expect(markdownShorthand?.status).toBe(308);
    expect(markdownShorthand?.headers.get('Location'))
      .toBe('/docs/writing/authors/index.md?view=full');
    expect(redirectCanonicalUrl(new Request('https://buxx.me/docs/writing/authors')))
      .toBeNull();
    expect(redirectCanonicalUrl(new Request('https://buxx.me/docs/writing/authors/index.md')))
      .toBeNull();
  });

  test('matches mood detail ids without stealing sibling mood utility routes', () => {
    expect(hasMarkdownRenderer('/mood/990001')).toBe(true);
    expect(hasMarkdownRenderer('/mood/rss.xml')).toBe(false);
    expect(hasMarkdownRenderer('/mood/embed')).toBe(false);
    expect(hasMarkdownRenderer('/mood/subscribe')).toBe(false);
    expect(getContentRoutePolicy('/mood/embed')?.edgeCacheHtml).toBe(true);
    expect(getContentRoutePolicy('/mood/subscribe')).toBeNull();
  });

  test('matches a translation under its locale, not under a tag or an unknown language', () => {
    expect(getMarkdownRenderer('/blog/quiet-architecture')?.params).toEqual({ slug: 'quiet-architecture' });
    expect(getMarkdownRenderer('/blog/en/quiet-architecture')?.params)
      .toEqual({ slug: 'quiet-architecture', locale: 'en' });
    expect(getMarkdownRenderer('/blog/en/quiet-architecture')?.renderer.id).toBe('blog-post');
    expect(getMarkdownRenderer('/blog/tag/systems')?.renderer.id).toBe('blog-tag');
    expect(hasMarkdownRenderer('/blog/fr/quiet-architecture')).toBe(false);
    expect(hasMarkdownRenderer('/blog/zh/quiet-architecture')).toBe(false);
    expect(getContentRoutePolicy('/blog/en/quiet-architecture')?.cacheTtlSeconds).toBe(86400);
  });

  test('declares cache policy for static discovery and content routes', () => {
    // Build-backed: a deploy starts the platform cache cold, so the platform
    // holds them for a day while outside shared caches keep a short TTL.
    for (const path of [
      '/',
      '/llms.txt',
      '/projects',
      '/sitemap.xml',
      '/blog/rss.xml',
      '/blog',
      '/blog/tags',
      '/blog/tag/systems',
      '/blog/quiet-architecture',
    ]) {
      expect(getContentRoutePolicy(path)?.cacheTtlSeconds).toBe(86400);
      expect(getContentRoutePolicy(path)?.sharedCacheTtlSeconds).toBe(300);
    }
    expect(getContentRoutePolicy('/privacy')?.cacheTtlSeconds).toBe(86400);
    expect(getContentRoutePolicy('/privacy')?.sharedCacheTtlSeconds).toBe(3600);
    // The Mood feed is live.
    expect(getContentRoutePolicy('/mood/rss.xml')?.cacheTtlSeconds).toBe(300);
    expect(getContentRoutePolicy('/mood/rss.xml')?.sharedCacheTtlSeconds).toBeUndefined();
  });

  test('gives build-backed Markdown renderers the deploy-bound TTL', () => {
    for (const path of ['/', '/privacy', '/blog', '/blog/tags', '/blog/tag/systems', '/blog/quiet-architecture']) {
      expect(getMarkdownRenderer(path)?.renderer.cacheTtlSeconds).toBe(86400);
    }
    expect(getMarkdownRenderer('/mood')?.renderer.cacheTtlSeconds).toBe(300);
    expect(getMarkdownRenderer('/mood/990001')?.renderer.cacheTtlSeconds).toBe(300);
  });

  test('serves blog post Markdown from build assets only when a binding exists', async () => {
    const assets: Record<string, string> = {
      '/_agent-markdown/blog/unlisted/post/hidden.md': '# Hidden\n',
    };
    const requested: string[] = [];
    const locals = { env: { ASSETS: { fetch: async (input: RequestInfo | URL) => {
      const pathname = new URL(input instanceof Request ? input.url : String(input)).pathname;
      requested.push(pathname);
      if (pathname === '/_i18n/posts.json') return Response.json({});
      const body = assets[pathname];
      return body ? new Response(body) : new Response('Not found', { status: 404 });
    } } } };

    const unlisted = await renderMarkdownIfRequested({
      request: new Request('https://buxx.me/blog/hidden/index.md'),
      locals,
    });
    expect(unlisted?.status).toBe(200);
    expect(unlisted?.headers.get('X-Robots-Tag')).toBe('noindex, nofollow, noarchive, nosnippet');
    expect(await unlisted?.text()).toBe('# Hidden\n');

    const missing = await renderMarkdownIfRequested({
      request: new Request('https://buxx.me/blog/does-not-exist/index.md'),
      locals,
    });
    expect(missing?.status).toBe(404);
    expect(await missing?.text()).toBe('Blog post not found.\n');
    // The build is authoritative, so the 404 is briefly cacheable.
    expect(missing?.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=300');
    expect(missing?.headers.get('Cloudflare-CDN-Cache-Control'))
      .toBe('public, max-age=300, stale-while-revalidate=86400, stale-if-error=86400');
    expect(requested).toContain('/_agent-markdown/blog/post/does-not-exist.md');
    expect(requested).toContain('/_agent-markdown/blog/unlisted/post/does-not-exist.md');
  });

  test('skips the asset probe only for SSR-only worker-first paths', () => {
    for (const path of ['/mood', '/mood/990001', '/mood/embed', '/mood/rss.xml', '/mood/subscribe', '/reader/confirm']) {
      expect(isSsrOnlyPath(path)).toBe(true);
    }
    for (const path of ['/', '/blog', '/blog/example', '/privacy', '/projects', '/mood-og.png', '/mood/', '/mood/a/b', '/reader/x.css']) {
      expect(isSsrOnlyPath(path)).toBe(false);
    }
  });

  test('delegates public Mood detail HTML caching to the platform', () => {
    const policy = getContentRoutePolicy('/mood/990001');

    expect(policy?.edgeCacheHtml).toBe(false);
    expect(policy?.cacheTtlSeconds).toBe(300);
    expect(policy?.cacheStaleWhileRevalidateSeconds).toBe(1800);

  });

  test('delegates public Mood feed HTML caching to the platform', () => {
    const policy = getContentRoutePolicy('/mood');

    expect(policy?.edgeCacheHtml).toBe(false);
    expect(policy?.cacheTtlSeconds).toBe(300);
    expect(policy?.cacheStaleWhileRevalidateSeconds).toBe(1800);
  });

  test('accepts raw mood anchor keys but rejects unrelated query strings', () => {
    const policy = getContentRoutePolicy('/mood');

    expect(policy?.normalizeHtmlCacheSearch?.(new URL('https://buxx.me/mood?3631')))
      .toBe('?3631');
    expect(policy?.normalizeHtmlCacheSearch?.(new URL('https://buxx.me/mood?3640')))
      .toBe('?3640');
    expect(policy?.normalizeHtmlCacheSearch?.(new URL('https://buxx.me/mood?source=archive')))
      .toBeNull();
    expect(policy?.normalizeHtmlCacheSearch?.(new URL('https://buxx.me/mood?3631&source=archive')))
      .toBeNull();
  });

  test('normalizes single valid tag filters and rejects everything else', () => {
    const policy = getContentRoutePolicy('/mood');

    expect(policy?.normalizeHtmlCacheSearch?.(new URL('https://buxx.me/mood?tag=abc')))
      .toBe('?tag=abc');
    expect(policy?.normalizeHtmlCacheSearch?.(new URL('https://buxx.me/mood?tag=mood_2026')))
      .toBe('?tag=mood_2026');
    expect(policy?.normalizeHtmlCacheSearch?.(new URL('https://buxx.me/mood?tag=abc&x=1')))
      .toBeNull();
    expect(policy?.normalizeHtmlCacheSearch?.(new URL('https://buxx.me/mood?tag=BAD')))
      .toBeNull();
    expect(policy?.normalizeHtmlCacheSearch?.(new URL('https://buxx.me/mood?tag=')))
      .toBeNull();
  });

  test('adds stale revalidation to shared content cache headers', () => {
    expect(publicCacheControl(60)).toBe('public, max-age=0, s-maxage=60');
    expect(publicCacheControl(300, 1800)).toBe(
      'public, max-age=0, s-maxage=300, stale-while-revalidate=1800'
    );
    expect(cloudflareCdnCacheControl(60)).toBe(
      'public, max-age=60, stale-while-revalidate=86400, stale-if-error=86400'
    );
    expect(cloudflareCdnCacheControl(300, 1800)).toBe(
      'public, max-age=300, stale-while-revalidate=1800, stale-if-error=1800'
    );
    expect(cloudflareCdnCacheControl(60, 0))
      .toBe('public, max-age=60, stale-while-revalidate=0, stale-if-error=0');
  });

  test('sets edge-only freshness for Worker-cached content routes', () => {
    const response = withContentPolicy(
      new Request('https://buxx.me/mood'),
      new Response('<!doctype html><main data-mood-initial-feed data-mood-id="1"></main>', {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      }),
    );

    expect(response.headers.get('Cache-Control')).toBe(
      'public, max-age=0, s-maxage=300, stale-while-revalidate=1800'
    );
    expect(response.headers.get('Cloudflare-CDN-Cache-Control'))
      .toBe('public, max-age=300, stale-while-revalidate=1800, stale-if-error=1800');
    expect(response.headers.get('Vary')).toBe('Accept, Accept-Language, Cookie');
  });

  test('refreshes platform policy on static asset 304 responses', () => {
    for (const pathname of ['/', '/blog', '/blog/example'] as const) {
      const response = withContentPolicy(
        new Request(`https://buxx.me${pathname}`),
        new Response(null, {
          status: 304,
          headers: { 'Cache-Control': 'public, max-age=0, must-revalidate', ETag: '"asset-v1"' },
        }),
      );

      expect(response.status).toBe(304);
      expect(response.body).toBeNull();
      expect(response.headers.get('ETag')).toBe('"asset-v1"');
      expect(response.headers.get('Vary')).toBe('Accept');
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=300');
      expect(response.headers.get('Cloudflare-CDN-Cache-Control'))
        .toBe('public, max-age=86400, stale-while-revalidate=86400, stale-if-error=86400');
    }
  });

  test('declares all locale inputs on every cacheable Mood HTML response', () => {
    for (const path of ['/mood', '/mood/990001']) {
      for (const status of [200, 304]) {
        for (const cookie of ['', 'blog_lang=en']) {
          const request = new Request(`https://buxx.me${path}`, {
            headers: { Cookie: cookie, 'Accept-Language': 'zh-CN' },
          });
          const response = new Response(status === 304 ? null : 'English', {
            status,
            headers: {
              'Content-Type': 'text/html',
              Vary: 'Accept-Language, cOoKiE',
              'Cache-Control': 'public, max-age=0, must-revalidate',
              ETag: '"mood-v1"',
            },
          });
          const outgoing = withContentPolicy(request, withContentPolicy(request, response));

          expect(outgoing.headers.get('Cloudflare-CDN-Cache-Control'))
            .toBe('public, max-age=300, stale-while-revalidate=1800, stale-if-error=1800');
          expect(outgoing.headers.get('Cache-Control'))
            .toBe('public, max-age=0, s-maxage=300, stale-while-revalidate=1800');
          expect(outgoing.headers.get('Vary')).toBe('Accept-Language, cOoKiE, Accept');
          expect(outgoing.headers.get('ETag')).toBe('"mood-v1"');
        }
      }
    }
  });

  test('keeps URL-addressed blog translations platform eligible', () => {
    for (const path of ['/blog/quiet-architecture', '/blog/en/quiet-architecture']) {
      const request = new Request(`https://buxx.me${path}`, {
        headers: { Cookie: 'blog_lang=zh', 'Accept-Language': 'en-US' },
      });
      const response = withContentPolicy(request, new Response('Article', {
        headers: { 'Content-Type': 'text/html' },
      }));

      expect(response.headers.get('Cloudflare-CDN-Cache-Control'))
        .toBe('public, max-age=86400, stale-while-revalidate=86400, stale-if-error=86400');
      expect(response.headers.get('Vary')).toBe('Accept');
    }
  });

  test('keeps mood HTML error responses out of the edge cache', () => {
    const response = withContentPolicy(
      new Request('https://buxx.me/mood'),
      new Response('<!doctype html><p>upstream unavailable</p>', {
        status: 503,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      }),
    );

    expect(response.headers.get('Cache-Control')).toBe('no-store, max-age=0');
    expect(response.headers.has('Cloudflare-CDN-Cache-Control')).toBe(false);
  });

  test('does not replace explicit no-store on refreshing mood embeds', () => {
    const response = withContentPolicy(
      new Request('https://buxx.me/mood/embed?refresh=60'),
      new Response('<!doctype html>', {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      }),
    );

    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.has('Cloudflare-CDN-Cache-Control')).toBe(false);
  });

  test('prevents heuristic Worker caching on unregistered HTML routes', async () => {
    const response = withContentPolicy(
      new Request('https://buxx.me/subscribe/manage'),
      new Response('<!doctype html>', {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-transform',
        },
      }),
    );

    expect(response.headers.get('Cache-Control')).toBe('no-transform, no-store, max-age=0');
    expect(response.headers.has('Cloudflare-CDN-Cache-Control')).toBe(false);
  });

  test('keeps markdown error responses out of Worker cache', async () => {
    const response = await renderMarkdownIfRequested({
      request: new Request('https://buxx.me/mood?before=bad', {
        headers: { Accept: 'text/markdown' },
      }),
      locals: {},
    });

    expect(response?.status).toBe(400);
    expect(response?.headers.get('Cache-Control')).toBe('no-store, max-age=0');
    expect(response?.headers.has('Cloudflare-CDN-Cache-Control')).toBe(false);
  });
});
