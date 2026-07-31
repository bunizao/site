import { afterEach, describe, expect, test } from 'bun:test';

import {
  transformPostDirectives,
  type DirectiveContext,
} from '@/features/posts/server/directives';
import { resetYouTubeMetadataCacheForTests } from '@/features/posts/server/youtube';

const originalFetch = globalThis.fetch;
const context = {
  slug: 'youtube-metadata-contract',
  locale: 'en',
  outputTarget: 'web',
} satisfies DirectiveContext;

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetYouTubeMetadataCacheForTests();
});

describe('YouTube directive metadata', () => {
  test('uses one bounded oEmbed lookup across repeated renders', async () => {
    const requests: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requests.push(String(input));
      return Response.json({
        title: 'Big Buck Bunny <4K>',
        author_name: 'Blender Foundation',
        author_url: 'https://www.youtube.com/@BlenderOfficial',
      });
    }) as typeof fetch;

    const source = '<p>[!youtube id="aqz-KE-bpKQ" start="12"]</p>';
    const first = await transformPostDirectives(source, context);
    const second = await transformPostDirectives(source, context);

    expect(requests).toHaveLength(1);
    const requestUrl = new URL(requests[0]);
    expect(requestUrl.origin + requestUrl.pathname).toBe('https://www.youtube.com/oembed');
    expect(requestUrl.searchParams.get('format')).toBe('json');
    expect(requestUrl.searchParams.get('url')).toBe(
      'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
    );
    expect(first.html).toContain('Big Buck Bunny &lt;4K&gt;');
    expect(first.html).toContain('Blender Foundation');
    expect(second.html).toBe(first.html);
  });

  test('falls back safely on malformed or oversized oEmbed responses', async () => {
    const responses = [
      new Response('{not-json'),
      new Response('{}', {
        headers: { 'content-length': String(64 * 1024 + 1) },
      }),
      new Response(JSON.stringify({ title: '', author_name: 'Channel' })),
    ];
    globalThis.fetch = Object.assign(
      async () => responses.shift() ?? new Response(null, { status: 404 }),
      { preconnect: originalFetch.preconnect },
    );

    for (const id of ['aqz-KE-bpKQ', 'jNQXAC9IVRw', 'M7lc1UVf-VE']) {
      const result = await transformPostDirectives(
        `<p>[!youtube id="${id}"]</p>`,
        context,
      );

      expect(result.html).toContain('YouTube video');
      expect(result.html).toContain('data-yt-player');
    }
  });

  test('deduplicates concurrent lookups but retries a transient failure', async () => {
    let requestCount = 0;
    globalThis.fetch = Object.assign(
      async () => {
        requestCount += 1;
        return requestCount === 1
          ? new Response(null, { status: 503 })
          : Response.json({ title: 'Recovered video', author_name: 'Recovered channel' });
      },
      { preconnect: originalFetch.preconnect },
    );

    const source = '<p>[!youtube id="aqz-KE-bpKQ"]</p>';
    const [first, concurrent] = await Promise.all([
      transformPostDirectives(source, context),
      transformPostDirectives(source, context),
    ]);
    const retried = await transformPostDirectives(source, context);

    expect(requestCount).toBe(2);
    expect(first.html).toBe(concurrent.html);
    expect(first.html).toContain('YouTube video');
    expect(retried.html).toContain('Recovered video');
  });
});
