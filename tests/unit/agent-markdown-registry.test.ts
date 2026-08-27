import { describe, expect, test } from 'bun:test';

import {
  explicitMarkdownSourcePath,
  getContentRoutePolicy,
  hasMarkdownRenderer,
  markdownAlternatePath,
} from '@/features/agent-markdown/server/registry';
import {
  cloudflareCdnCacheControl,
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
    expect(await response?.text()).toContain('# Privacy Policy');
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

  test('declares cache policy for static discovery and content routes', () => {
    expect(getContentRoutePolicy('/llms.txt')?.cacheTtlSeconds).toBe(300);
    expect(getContentRoutePolicy('/projects')?.cacheTtlSeconds).toBe(300);
    expect(getContentRoutePolicy('/sitemap.xml')?.cacheTtlSeconds).toBe(300);
    expect(getContentRoutePolicy('/blog/rss.xml')?.cacheTtlSeconds).toBe(300);
    expect(getContentRoutePolicy('/mood/rss.xml')?.cacheTtlSeconds).toBe(300);
  });

  test('declares stale edge HTML cache policy for public mood detail pages', () => {
    const policy = getContentRoutePolicy('/mood/990001');

    expect(policy?.edgeCacheHtml).toBe(true);
    expect(policy?.cacheTtlSeconds).toBe(300);
    expect(policy?.cacheStaleWhileRevalidateSeconds).toBe(1800);
    expect(policy?.isHtmlReady?.('<article data-mood-id="990001"></article>', new Response()))
      .toBe(true);
    expect(policy?.isHtmlReady?.(
      '<article data-mood-id="990001" data-mood-preview-pending="true"></article>',
      new Response(),
    )).toBe(false);
  });

  test('declares longer edge HTML cache policy for the public mood feed', () => {
    const policy = getContentRoutePolicy('/mood');

    expect(policy?.edgeCacheHtml).toBe(true);
    expect(policy?.cacheTtlSeconds).toBe(300);
    expect(policy?.cacheStaleWhileRevalidateSeconds).toBe(1800);
  });

  test('normalizes valid mood anchors but rejects unrelated query strings', () => {
    const policy = getContentRoutePolicy('/mood');

    expect(policy?.normalizeHtmlCacheSearch?.(new URL('https://buxx.me/mood?3631')))
      .toBe('?anchor-bucket=3640');
    expect(policy?.normalizeHtmlCacheSearch?.(new URL('https://buxx.me/mood?3640')))
      .toBe('?anchor-bucket=3640');
    expect(policy?.normalizeHtmlCacheSearch?.(new URL('https://buxx.me/mood?utm_source=x')))
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
      'public, max-age=60, stale-while-revalidate=300'
    );
    expect(cloudflareCdnCacheControl(300, 1800)).toBe(
      'public, max-age=300, stale-while-revalidate=1800'
    );
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
    expect(response.headers.get('Cloudflare-CDN-Cache-Control')).toBe(
      'public, max-age=300, stale-while-revalidate=1800'
    );
    expect(response.headers.get('Vary')).toBe('Accept');
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
