import { describe, expect, test } from 'bun:test';

import {
  cacheHtmlPageResponse,
  readCachedHtmlPage,
} from '@/features/agent-markdown/server/responses';
import {
  buildVariantCacheKey,
  shouldBypassEdgeCache,
} from '@/lib/http/edge-cache';

describe('variant edge cache', () => {
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
    expect(cached?.headers.get('X-Buxx-Edge-Cache')).toBe('HIT');
    expect(cached?.headers.get('Cloudflare-CDN-Cache-Control')).toBe('no-store');
    expect(await cached?.text()).toBe('<!doctype html><p>cached embed</p>');
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
});
