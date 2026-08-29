import { describe, expect, test } from 'bun:test';

import {
  cacheHtmlPageResponse,
  contentEdgeCacheVersion,
  readCachedHtmlPage,
  withContentPolicy,
} from '@/features/agent-markdown/server/responses';
import {
  buildVariantCacheKey,
  cacheEdgeResponse,
  readEdgeCache,
  shouldBypassEdgeCache,
} from '@/lib/http/edge-cache';
import { getContentRoutePolicy } from '@/features/agent-markdown/server/registry';

describe('variant edge cache', () => {
  test('isolates build-backed HTML and Markdown caches between deployments', () => {
    expect(contentEdgeCacheVersion('/', 'deploy-a')).not.toBe(
      contentEdgeCacheVersion('/', 'deploy-b'),
    );
    expect(contentEdgeCacheVersion('/blog/private-link-demo/', 'deploy-a')).not.toBe(
      contentEdgeCacheVersion('/blog/private-link-demo/', 'deploy-b'),
    );
    expect(contentEdgeCacheVersion('/docs/writing/poem', 'deploy-a')).not.toBe(
      contentEdgeCacheVersion('/docs/writing/poem', 'deploy-b'),
    );
    expect(contentEdgeCacheVersion('/mood/123', 'deploy-a')).toBe(
      contentEdgeCacheVersion('/mood/123', 'deploy-b'),
    );
    expect(getContentRoutePolicy('/')?.edgeCacheHtml).toBe(true);
  });

  test('builds separate keys for html and markdown variants', () => {
    const request = new Request('https://buxx.me/blog/demo-effects/?utm=ignored');
    const htmlKey = buildVariantCacheKey(request, {
      namespace: 'content',
      variant: 'html',
      version: '1',
    });
    const markdownKey = buildVariantCacheKey(request, {
      namespace: 'content',
      variant: 'markdown',
      version: '1',
    });

    expect(htmlKey.url).not.toBe(markdownKey.url);
    expect(new URL(htmlKey.url).searchParams.get('variant')).toBe('html');
    expect(new URL(markdownKey.url).searchParams.get('variant')).toBe('markdown');
    expect(new URL(htmlKey.url).searchParams.get('path')).toBe('/blog/demo-effects/');
  });

  test('honors explicit client cache bypass headers', () => {
    expect(shouldBypassEdgeCache(new Request('https://buxx.me/mood'))).toBe(false);
    expect(shouldBypassEdgeCache(new Request('https://buxx.me/mood', {
      headers: { 'Cache-Control': 'no-cache' },
    }))).toBe(true);
    expect(shouldBypassEdgeCache(new Request('https://buxx.me/mood', {
      headers: { Pragma: 'no-cache' },
    }))).toBe(true);
  });

  test('normalizes mood embed cache keys to semantic query params', async () => {
    const firstRequest = new Request(
      'https://buxx.me/mood/embed?utm_source=feed&theme=dark&count=3&frame=false&fbclid=abc',
    );
    const secondRequest = new Request(
      'https://buxx.me/mood/embed?fbclid=def&frame=false&count=3&theme=dark&utm_campaign=ignored',
    );

    const stored = await cacheHtmlPageResponse(
      firstRequest,
      new Response('<!doctype html><p>cached embed</p>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }),
    );
    const cached = await readCachedHtmlPage(secondRequest);

    expect(stored.headers.get('X-Buxx-Edge-Cache')).toBe('MISS');
    expect(stored.headers.get('Cloudflare-CDN-Cache-Control')).toBe('no-store');
    expect(cached?.isStale).toBe(false);
    expect(cached?.response.headers.get('X-Buxx-Edge-Cache')).toBe('HIT');
    expect(cached?.response.headers.get('Cloudflare-CDN-Cache-Control')).toBe('no-store');
    expect(await cached?.response.text()).toBe('<!doctype html><p>cached embed</p>');
  });

  test('bypasses mood embed HTML cache when refresh is present', async () => {
    const request = new Request('https://buxx.me/mood/embed?count=3&refresh=60');
    const stored = await cacheHtmlPageResponse(
      request,
      new Response('<!doctype html><p>refreshing embed</p>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }),
    );

    expect(stored.headers.has('X-Buxx-Edge-Cache')).toBe(false);
    expect(await readCachedHtmlPage(request)).toBeNull();
  });

  test('bypasses mood embed HTML cache for unbounded personalized params', async () => {
    const requests = [
      new Request('https://buxx.me/mood/embed?id=not-a-post'),
      new Request('https://buxx.me/mood/embed?origin=https%3A%2F%2Fexample.com'),
    ];

    for (const request of requests) {
      const stored = await cacheHtmlPageResponse(
        request,
        new Response('<!doctype html><p>uncached embed</p>', {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }),
      );

      expect(stored.headers.has('X-Buxx-Edge-Cache')).toBe(false);
      expect(await readCachedHtmlPage(request)).toBeNull();
    }
  });

  test('shares mood anchor HTML cache entries within a ten-post bucket', async () => {
    const firstRequest = new Request('https://buxx.me/mood?3631');
    const secondRequest = new Request('https://buxx.me/mood?3640');
    const body = '<!doctype html><main data-mood-initial-feed data-mood-id="3631"></main>';

    const stored = await cacheHtmlPageResponse(
      firstRequest,
      new Response(body, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }),
    );
    const cached = await readCachedHtmlPage(secondRequest);

    expect(stored.headers.get('X-Buxx-Mood-Page-Cache')).toBe('MISS');
    expect(stored.headers.get('Cloudflare-CDN-Cache-Control')).toBe('no-store');
    expect(cached?.response.headers.get('X-Buxx-Mood-Page-Cache')).toBe('HIT');
    expect(await cached?.response.text()).toBe(body);
  });

  test('keeps fallback anchor renders out of the shared HTML cache', async () => {
    const request = new Request('https://buxx.me/mood?9999');
    const response = withContentPolicy(
      request,
      new Response('<!doctype html><main data-mood-initial-feed data-mood-id="9999"></main>', {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      }),
    );

    const stored = await cacheHtmlPageResponse(request, response);

    expect(stored.headers.get('X-Buxx-Mood-Page-Cache')).toBeNull();
    expect(await readCachedHtmlPage(request)).toBeNull();
  });

  test('marks entries past ttl but inside the swr window as stale', async () => {
    const options = {
      namespace: 'content',
      variant: 'html' as const,
      version: 'swr-test',
      ttlSeconds: 0,
      staleWhileRevalidateSeconds: 60,
      headerName: 'X-Test-Cache',
      cacheControl: 'public, max-age=0, stale-while-revalidate=60',
    };
    const request = new Request('https://buxx.me/swr-test');

    await cacheEdgeResponse(
      request,
      new Response('stale-candidate', { headers: { 'Content-Type': 'text/html' } }),
      options,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    const hit = await readEdgeCache(request, options);

    expect(hit?.isStale).toBe(true);
    expect(hit?.response.headers.get('X-Test-Cache')).toBe('STALE');
    expect(await hit?.response.text()).toBe('stale-candidate');
  });

  test('defers the cache write through waitUntil when a context is provided', async () => {
    const tasks: Promise<unknown>[] = [];
    const options = {
      namespace: 'content',
      variant: 'html' as const,
      version: 'waituntil-test',
      ttlSeconds: 60,
      headerName: 'X-Test-Cache',
      cacheControl: 'public, max-age=60',
    };
    const request = new Request('https://buxx.me/waituntil-test');

    const outgoing = await cacheEdgeResponse(
      request,
      new Response('deferred', { headers: { 'Content-Type': 'text/html' } }),
      options,
      { waitUntil: (promise) => tasks.push(promise) },
    );

    expect(outgoing.headers.get('X-Test-Cache')).toBe('MISS');
    expect(await outgoing.text()).toBe('deferred');
    expect(tasks).toHaveLength(1);
    await Promise.all(tasks);

    const hit = await readEdgeCache(request, options);
    expect(hit?.isStale).toBe(false);
    expect(await hit?.response.text()).toBe('deferred');
  });
});
