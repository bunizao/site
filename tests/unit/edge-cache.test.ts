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
    expect(contentEdgeCacheVersion('/mood/123', 'deploy-a')).not.toBe(
      contentEdgeCacheVersion('/mood/123', 'deploy-b'),
    );
    expect(contentEdgeCacheVersion('/mood', 'deploy-a')).not.toBe(
      contentEdgeCacheVersion('/mood', 'deploy-b'),
    );
    expect(contentEdgeCacheVersion('/mood/embed', 'deploy-a')).not.toBe(
      contentEdgeCacheVersion('/mood/embed', 'deploy-b'),
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
    expect(stored.headers.get('Cloudflare-CDN-Cache-Control'))
      .toBe('public, max-age=300, stale-while-revalidate=86400');
    expect(cached?.isStale).toBe(false);
    expect(cached?.response.headers.get('X-Buxx-Edge-Cache')).toBe('HIT');
    expect(cached?.response.headers.get('Cloudflare-CDN-Cache-Control'))
      .toBe('public, max-age=300, stale-while-revalidate=86400');
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
    expect(stored.headers.get('Cloudflare-CDN-Cache-Control'))
      .toBe('no-store');
    expect(cached?.response.headers.get('X-Buxx-Mood-Page-Cache')).toBe('HIT');
    expect(await cached?.response.text()).toBe(body);
  });

  test.each(['/mood', '/mood?tag=abc', '/mood?3631', '/mood/989986'])(
    'isolates resolved locales in the %s HTML cache',
    async (path) => {
      const request = (headers: HeadersInit) => new Request(`https://locale-cache.example${path}`, { headers });
      const english = request({ 'Accept-Language': 'en-US' });
      const chinese = request({ 'Accept-Language': 'zh-CN' });
      const stored = await cacheHtmlPageResponse(english, new Response('English', {
        headers: { 'Content-Type': 'text/html' },
      }));
      expect(await readCachedHtmlPage(chinese)).toBeNull();
      await cacheHtmlPageResponse(chinese, new Response('Chinese', {
        headers: { 'Content-Type': 'text/html' },
      }));
      const englishCookie = await readCachedHtmlPage(request({
        Cookie: 'blog_lang=en; session=irrelevant', 'Accept-Language': 'zh-CN',
      }));
      const sameEnglish = await readCachedHtmlPage(request({
        Cookie: 'unrelated=value', 'Accept-Language': 'en-GB,en;q=0.9,zh;q=0.1',
      }));
      const chineseCookie = await readCachedHtmlPage(request({
        Cookie: 'blog_lang=zh', 'Accept-Language': 'en-US',
      }));

      expect(await englishCookie?.response.text()).toBe('English');
      expect(await sameEnglish?.response.text()).toBe('English');
      expect(await chineseCookie?.response.text()).toBe('Chinese');
      for (const response of [stored, englishCookie?.response, sameEnglish?.response, chineseCookie?.response]) {
        expect(response?.headers.get('Cloudflare-CDN-Cache-Control')).toBe('no-store');
        expect(response?.headers.get('Vary')).toBe('Accept, Accept-Language, Cookie');
      }
    },
  );

  test('keeps negotiated HTML off the platform during client cache bypass', async () => {
    const request = new Request('https://locale-client-bypass.example/mood/989987', {
      headers: { Cookie: 'blog_lang=en', 'Cache-Control': 'no-cache' },
    });
    const outgoing = await cacheHtmlPageResponse(request, new Response('English', {
      headers: { 'Content-Type': 'text/html' },
    }));

    expect(outgoing.headers.get('X-Buxx-Edge-Cache')).toBe('BYPASS');
    expect(outgoing.headers.get('Cloudflare-CDN-Cache-Control')).toBe('no-store');
    expect(await readCachedHtmlPage(new Request(request.url))).toBeNull();
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

  test('keeps incomplete renders private across middleware and Worker decoration', async () => {
    for (const [index, path] of ['/mood', '/mood?post=989981', '/mood/989982'].entries()) {
      const request = new Request(`https://pending-${index}.example${path}`);
      const body = '<!doctype html><main>Content is still loading</main>';
      const response = new Response(body, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
          'Cloudflare-CDN-Cache-Control': 'public, max-age=300',
          'X-Buxx-Cache-Ready': '0',
        },
      });
      const middlewareResponse = withContentPolicy(request, response);
      expect(middlewareResponse.headers.has('X-Buxx-Cache-Ready')).toBe(false);
      const workerResponse = withContentPolicy(request, middlewareResponse);
      const outgoing = await cacheHtmlPageResponse(request, workerResponse);

      expect(outgoing.headers.get('Cache-Control')).toBe('no-store, max-age=0');
      expect(outgoing.headers.get('Cloudflare-CDN-Cache-Control')).toBe('no-store');
      expect(outgoing.headers.has('X-Buxx-Cache-Ready')).toBe(false);
      expect(await outgoing.text()).toBe(body);
      expect(await readCachedHtmlPage(request)).toBeNull();
    }
  });

  test('keeps pending renders private with client bypass headers', async () => {
    const request = new Request('https://pending-bypass.example/mood/989983', {
      headers: { 'Cache-Control': 'no-cache' },
    });
    const outgoing = await cacheHtmlPageResponse(request, new Response('Pending', {
      headers: { 'Content-Type': 'text/html', 'X-Buxx-Cache-Ready': '0' },
    }));

    expect(outgoing.headers.get('Cache-Control')).toBe('no-store, max-age=0');
    expect(outgoing.headers.get('Cloudflare-CDN-Cache-Control')).toBe('no-store');
    expect(outgoing.headers.has('X-Buxx-Cache-Ready')).toBe(false);
  });

  test('strips positive readiness before cache storage and client responses', async () => {
    const request = new Request('https://ready.example/mood/989984');
    const outgoing = await cacheHtmlPageResponse(request, new Response('Ready', {
      headers: { 'Content-Type': 'text/html', 'X-Buxx-Cache-Ready': '1' },
    }));
    const cached = await readCachedHtmlPage(request);

    expect(outgoing.headers.has('X-Buxx-Cache-Ready')).toBe(false);
    expect(cached?.response.headers.has('X-Buxx-Cache-Ready')).toBe(false);
    expect(cached?.response.headers.get('X-Buxx-Edge-Cache')).toBe('HIT');
    expect(await cached?.response.text()).toBe('Ready');
    expect(await (await readCachedHtmlPage(request))?.response.text()).toBe('Ready');
  });

  test('bypasses both caches on unknown, fresh, source, and probe query shapes', async () => {
    const paths = [
      '/mood?source=archive', '/mood?fresh=1', '/mood?refresh=1', '/mood?probe=1',
      '/mood?lang=en', '/mood?lang=en&lang=zh', '/mood/989985?lang=zh',
      '/mood?tag=abc&source=archive', '/mood?tag=BAD', '/mood?post=invalid',
      '/mood/989985?source=live', '/mood/989985?fresh=1', '/mood/989985?probe=1',
      '/mood/embed?refresh=60', '/mood/embed?id=invalid',
    ];
    for (const path of paths) {
      const request = new Request(`https://query-bypass.example${path}`);
      const outgoing = await cacheHtmlPageResponse(request, new Response('Uncached', {
        headers: { 'Content-Type': 'text/html', 'Cache-Control': 'public, max-age=300' },
      }));

      expect(outgoing.headers.get('Cache-Control')).toBe('no-store, max-age=0');
      expect(outgoing.headers.get('Cloudflare-CDN-Cache-Control'))
        .toBe(path.startsWith('/mood/embed') ? null : 'no-store');
      expect(await readCachedHtmlPage(request)).toBeNull();
    }
  });

  test('streams native cache writes before the rendered body completes', async () => {
    const originalCaches = Object.getOwnPropertyDescriptor(globalThis, 'caches');
    const tasks: Promise<unknown>[] = [];
    let writerCalled = false;
    let storedBody: ArrayBuffer | undefined;
    let storedHeaders: Headers | undefined;
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(streamController) {
        controller = streamController;
        controller.enqueue(new TextEncoder().encode('first chunk'));
      },
    });
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: {
        default: {
          async put(_key: Request, response: Response) {
            writerCalled = true;
            storedHeaders = response.headers;
            storedBody = await response.arrayBuffer();
          },
        },
      },
    });

    try {
      const outgoing = await cacheEdgeResponse(
        new Request('https://streaming.example/page'),
        new Response(body, {
          headers: { 'Set-Cookie': 'preference=en', 'Content-Type': 'text/html' },
        }),
        {
          namespace: 'content', variant: 'html', version: 'stream-test', ttlSeconds: 60,
          headerName: 'X-Test-Cache', cacheControl: 'public, max-age=0',
          cloudflareCacheControl: 'public, max-age=60',
        },
        { waitUntil: (promise) => tasks.push(promise) },
      );

      expect(writerCalled).toBe(true);
      expect(storedBody).toBeUndefined();
      expect(storedHeaders?.has('Set-Cookie')).toBe(false);
      expect(storedHeaders?.has('Cloudflare-CDN-Cache-Control')).toBe(false);
      expect(storedHeaders?.has('x-edge-cached-at')).toBe(true);
      expect(outgoing.headers.has('x-edge-cached-at')).toBe(false);
      expect(outgoing.headers.get('Set-Cookie')).toBe('preference=en');
      controller.enqueue(new TextEncoder().encode(' final chunk'));
      controller.close();
      expect(await outgoing.text()).toBe('first chunk final chunk');
      await Promise.all(tasks);
      expect(new TextDecoder().decode(storedBody)).toBe('first chunk final chunk');
    } finally {
      if (originalCaches) Object.defineProperty(globalThis, 'caches', originalCaches);
      else Reflect.deleteProperty(globalThis, 'caches');
    }
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
