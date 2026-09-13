import { afterEach, describe, expect, mock, test } from 'bun:test';
import { withRequestVary } from '@/features/agent-markdown/server/responses';

let astroResponse = () => new Response('Dynamic page', {
  headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' },
});
mock.module('@astrojs/cloudflare/entrypoints/server', () => ({
  default: { fetch: async () => astroResponse() },
}));
const { default: worker } = await import('../../src/worker');
const context = { waitUntil: () => {} };

afterEach(() => {
  astroResponse = () => new Response('Dynamic page', {
    headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' },
  });
});

function varyTokens(response: Response): string[] {
  return (response.headers.get('Vary') ?? '').toLowerCase().split(',').map((token) => token.trim());
}

describe('Worker response cache boundary', () => {
  test.each([
    ['https://www.buxx.me/projects', 301],
    ['https://buxx.me/projects/', 308],
  ] as const)('partitions canonical redirects by host on %s', async (url, status) => {
    const response = await worker.fetch(new Request(url), {}, context);
    expect(response.status).toBe(status);
    expect(varyTokens(response)).toContain('host');
  });

  test('partitions Markdown responses by host and content type', async () => {
    const response = await worker.fetch(new Request('https://host-markdown.example/privacy', {
      headers: { Accept: 'text/markdown' },
    }), {}, context);
    expect(response.headers.get('Content-Type')).toContain('text/markdown');
    expect(varyTokens(response)).toEqual(['accept', 'host']);
  });

  test.each(['/mood', '/mood/3618'])(
    'keeps identical variance while interleaving HTML and legacy Markdown cache hits on %s',
    async (path) => {
      const originalCaches = Object.getOwnPropertyDescriptor(globalThis, 'caches');
      Object.defineProperty(globalThis, 'caches', {
        configurable: true,
        value: { default: { async match(request: Request) {
          if (new URL(request.url).searchParams.get('variant') !== 'markdown') return undefined;
          return new Response('# Cached Mood', { headers: {
            'Content-Type': 'text/markdown', Vary: 'Accept', 'x-edge-cached-at': String(Date.now()),
          } });
        } } },
      });
      try {
        const env = { ASSETS: { fetch: async () => new Response('Mood HTML', { headers: {
          'Content-Type': 'text/html', Vary: 'Accept-Language, Cookie',
        } }) } };
        for (const accept of ['text/html', 'text/markdown', 'text/html', 'text/markdown']) {
          const response = await worker.fetch(new Request(`https://vary-contract.example${path}`, {
            headers: { Accept: accept, Cookie: 'blog_lang=en', 'Accept-Language': 'zh-CN' },
          }), env, context);
          expect(response.headers.get('Vary')).toBe('Accept, Accept-Language, Cookie, Host');
          if (accept === 'text/markdown') {
            expect(response.headers.get('X-Buxx-Edge-Cache')).toBe('HIT');
            expect(await response.text()).toBe('# Cached Mood');
          } else {
            expect(response.headers.has('X-Buxx-Edge-Cache')).toBe(false);
            expect(await response.text()).toBe('Mood HTML');
          }
        }
      } finally {
        if (originalCaches) Object.defineProperty(globalThis, 'caches', originalCaches);
        else Reflect.deleteProperty(globalThis, 'caches');
      }
    },
  );

  test.each(['/', '/blog', '/blog/example', '/privacy'])(
    'keeps Accept and Host consistent across %s representations and redirects',
    async (path) => {
      const originalCaches = Object.getOwnPropertyDescriptor(globalThis, 'caches');
      Object.defineProperty(globalThis, 'caches', {
        configurable: true,
        value: { default: {
          async match(request: Request) {
            if (new URL(request.url).searchParams.get('variant') !== 'markdown') return undefined;
            return new Response('# Cached content', { headers: {
              'Content-Type': 'text/markdown', Vary: 'Accept', 'x-edge-cached-at': String(Date.now()),
            } });
          },
          async put() {},
        } },
      });
      try {
        const env = { ASSETS: { fetch: async (input: RequestInfo | URL) => {
          const url = new URL(input instanceof Request ? input.url : String(input));
          return url.pathname === '/_i18n/posts.json'
            ? Response.json({})
            : new Response('HTML', { headers: { 'Content-Type': 'text/html', Vary: 'Host' } });
        } } };
        const explicitPath = `${path === '/' ? '' : path}/index.md`;
        const responses = [
          await worker.fetch(new Request(`https://buxx.me${path}`, { headers: { Accept: 'text/html' } }), env, context),
          await worker.fetch(new Request(`https://buxx.me${path}`, { headers: { Accept: 'text/markdown' } }), env, context),
          await worker.fetch(new Request(`https://www.buxx.me${path}`), env, context),
          await worker.fetch(new Request(`https://buxx.me${explicitPath}`), env, context),
          await worker.fetch(new Request(`https://www.buxx.me${explicitPath}`), env, context),
          await worker.fetch(new Request(`https://bodyless.example${path}`), {
            ASSETS: { fetch: async () => new Response(null, { status: 304 }) },
          }, context),
        ];
        if (path !== '/') {
          const redirect = await worker.fetch(new Request(`https://buxx.me${path}/`), env, context);
          expect(redirect.status).toBe(308);
          responses.push(redirect);
        }
        expect(responses[2].status).toBe(301);
        expect(responses[4].status).toBe(301);
        expect(responses[5].status).toBe(304);
        for (const response of responses) {
          expect(response.headers.get('Vary')).toBe('Accept, Host');
        }
      } finally {
        if (originalCaches) Object.defineProperty(globalThis, 'caches', originalCaches);
        else Reflect.deleteProperty(globalThis, 'caches');
      }
    },
  );

  test('uses the same variance on explicit Mood Markdown and its host redirect', async () => {
    const request = new Request('https://buxx.me/mood/index.md');
    const markdown = withRequestVary(request, new Response('# Mood', {
      headers: { 'Content-Type': 'text/markdown', Vary: 'Accept' },
    }));
    const redirect = await worker.fetch(new Request('https://www.buxx.me/mood/index.md'), {}, context);
    expect(redirect.status).toBe(301);
    expect(markdown.headers.get('Vary')).toBe('Accept, Host');
    expect(redirect.headers.get('Vary')).toBe(markdown.headers.get('Vary'));
  });

  test('partitions native cache MISS and HIT responses by host', async () => {
    let renders = 0;
    const tasks: Promise<unknown>[] = [];
    const env = { ASSETS: { fetch: async () => {
      renders += 1;
      return new Response('Home', { headers: { 'Content-Type': 'text/html' } });
    } } };
    const request = new Request('https://host-html.example/');
    const first = await worker.fetch(request, env, { waitUntil: (task) => tasks.push(task) });
    await Promise.all(tasks);
    const second = await worker.fetch(request, env, context);

    expect(first.headers.get('X-Buxx-Edge-Cache')).toBe('MISS');
    expect(second.headers.get('X-Buxx-Edge-Cache')).toBe('HIT');
    expect(varyTokens(first)).toEqual(['accept', 'host']);
    expect(varyTokens(second)).toEqual(['accept', 'host']);
    expect(renders).toBe(1);
  });

  test.each([
    ['/', ['accept', 'host']],
    ['/privacy', ['accept', 'host']],
    ['/projects', ['host']],
    ['/mood', ['accept', 'accept-language', 'cookie', 'host']],
    ['/mood/999001', ['accept', 'accept-language', 'cookie', 'host']],
  ] as const)('retains complete variance on a bodyless %s 304', async (path, vary) => {
    const response = await worker.fetch(new Request(`https://host-304.example${path}`), {
      ASSETS: { fetch: async () => new Response(null, {
        status: 304,
        headers: { ETag: '"asset-v1"' },
      }) },
    }, context);
    expect(response.status).toBe(304);
    expect(response.body).toBeNull();
    expect(response.headers.has('Content-Type')).toBe(false);
    expect(response.headers.get('ETag')).toBe('"asset-v1"');
    expect(varyTokens(response)).toEqual([...vary]);
    const staleWindow = path.startsWith('/mood') ? 1800 : 86400;
    expect(response.headers.get('Cloudflare-CDN-Cache-Control'))
      .toContain(`stale-while-revalidate=${staleWindow}, stale-if-error=${staleWindow}`);
  });

  test.each(['GET', 'POST'])('covers the %s direct Astro response path', async (method) => {
    astroResponse = () => new Response('Rejected', { status: 403, headers: { 'Cache-Control': 'no-store' } });
    const response = await worker.fetch(new Request('https://host-api.example/api/private', { method }), {}, context);
    expect(response.status).toBe(403);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(varyTokens(response)).toEqual(['host']);
    expect(await response.text()).toBe('Rejected');
  });

  test.each([200, 400, 500, 304])('normalizes Mood variance on status %i and preserves extra inputs', (status) => {
    const request = new Request('https://vary-errors.example/mood');
    const response = withRequestVary(request, new Response(status === 304 ? null : 'Body', {
      status,
      headers: { Vary: 'X-Theme, cOoKiE, Accept, x-theme' },
    }));
    expect(response.headers.get('Vary')).toBe('Accept, Accept-Language, Cookie, Host, X-Theme');
    expect(response.status).toBe(status);
    expect(withRequestVary(request, response)).toBe(response);
  });

  test('preserves wildcard variance and response streaming', async () => {
    const request = new Request('https://host-wrapper.example/projects');
    const wildcard = new Response('Dynamic', { headers: { Vary: '*' } });
    expect(withRequestVary(request, wildcard)).toBe(wildcard);
    const response = new Response('Stream', { headers: { Vary: 'Cookie, hOsT' } });
    const decorated = withRequestVary(request, response);
    expect(withRequestVary(request, decorated)).toBe(decorated);
    expect(decorated.bodyUsed).toBe(false);
    expect(decorated.headers.get('Vary')).toBe('Host, Cookie');
    let pulls = 0;
    const streamed = withRequestVary(request, new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new TextEncoder().encode('Streaming body'));
        controller.close();
      },
    }, { highWaterMark: 0 })));
    expect(pulls).toBe(0);
    expect(streamed.bodyUsed).toBe(false);
    expect(await streamed.text()).toBe('Streaming body');
    expect(pulls).toBe(1);
  });
});
