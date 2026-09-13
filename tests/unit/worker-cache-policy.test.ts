import { afterEach, describe, expect, mock, test } from 'bun:test';
import { withHostVary } from '@/features/agent-markdown/server/responses';

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

  test('preserves wildcard variance and response streaming', async () => {
    const wildcard = new Response('Dynamic', { headers: { Vary: '*' } });
    expect(withHostVary(wildcard)).toBe(wildcard);
    const response = new Response('Stream', { headers: { Vary: 'Cookie, hOsT' } });
    const decorated = withHostVary(response);
    expect(decorated).toBe(response);
    expect(decorated.bodyUsed).toBe(false);
    expect(decorated.headers.get('Vary')).toBe('Cookie, hOsT');
    let pulls = 0;
    const streamed = withHostVary(new Response(new ReadableStream<Uint8Array>({
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
