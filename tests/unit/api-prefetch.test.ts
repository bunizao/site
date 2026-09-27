import { afterEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { NEAR_ROOT_MARGIN, fetchPrefetched, prefetchScript, prefetchScriptWhenNear } from '@/lib/api-prefetch';
import { blogCommentsUrl, moodCommentsUrl, reactionsUrl } from '@/features/comments/api-urls';

const realFetch = globalThis.fetch;
const realWindow = (globalThis as { window?: unknown }).window;
const realDocument = (globalThis as { document?: unknown }).document;
const realObserver = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;

afterEach(() => {
  globalThis.fetch = realFetch;
  (globalThis as { window?: unknown }).window = realWindow;
  (globalThis as { document?: unknown }).document = realDocument;
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = realObserver;
});

function stubFetch(): string[] {
  const calls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    calls.push(url);
    return new Response(JSON.stringify({ url }));
  }) as typeof fetch;
  return calls;
}

describe('api prefetch', () => {
  test('the inline script starts each URL once and the consumer takes it once', async () => {
    const calls = stubFetch();
    (globalThis as { window?: unknown }).window = globalThis;
    const url = moodCommentsUrl('3874');

    new Function(prefetchScript([url, url]))();
    expect(calls).toEqual([url]);

    const first = await fetchPrefetched(url);
    expect(await first.json()).toEqual({ url });
    expect(calls).toEqual([url]);

    await fetchPrefetched(url);
    expect(calls).toEqual([url, url]);
  });

  test('the proximity-gated script waits for the preceding element to come near', () => {
    const calls = stubFetch();
    const target = { id: 'colophon' };
    let fire: ((entries: { isIntersecting: boolean }[]) => void) | undefined;
    let observed: unknown;
    let options: { rootMargin?: string } | undefined;
    let disconnected = false;
    class FakeObserver {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void, init: { rootMargin?: string }) {
        fire = callback;
        options = init;
      }
      observe(el: unknown) { observed = el; }
      disconnect() { disconnected = true; }
    }
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = FakeObserver;
    (globalThis as { window?: unknown }).window = globalThis;
    (globalThis as { document?: unknown }).document = { currentScript: { previousElementSibling: target } };
    const url = blogCommentsUrl('near');

    new Function(prefetchScriptWhenNear([url]))();
    expect(calls).toEqual([]);
    expect(observed).toBe(target);
    expect(options?.rootMargin).toBe(NEAR_ROOT_MARGIN);

    fire?.([{ isIntersecting: false }]);
    expect(calls).toEqual([]);
    fire?.([{ isIntersecting: true }]);
    expect(calls).toEqual([url]);
    expect(disconnected).toBe(true);
  });

  test('the proximity-gated script fires at once with nothing to observe', () => {
    const calls = stubFetch();
    (globalThis as { window?: unknown }).window = globalThis;
    (globalThis as { document?: unknown }).document = { currentScript: null };
    const url = blogCommentsUrl('eager');

    new Function(prefetchScriptWhenNear([url]))();
    expect(calls).toEqual([url]);
    expect(prefetchScriptWhenNear(['/api/x?q=</script>'])).not.toContain('</script>');
  });

  test('blog posts gate their API reads on the reader nearing the end of the post', () => {
    const page = readFileSync(new URL('../../src/pages/blog/[...slug].astro', import.meta.url), 'utf8');
    const controller = readFileSync(
      new URL('../../src/features/comments/client/comments-controller.ts', import.meta.url),
      'utf8',
    );

    expect(page).toMatch(/<\/Colophon>\s*\{\/\*[\s\S]*?\*\/\}\s*<ApiPrefetch whenNear urls=\{earlyApiUrls\} \/>/);
    expect(page.match(/<ApiPrefetch /g)?.length).toBe(1);
    expect(controller).toContain('whenNear(section, () => void bootstrap());');
    expect(controller).toContain('rootMargin: NEAR_ROOT_MARGIN');
    // Rows wait on their like counts before they render -- never a flash of
    // zero likes patched in a moment later.
    expect(controller).toContain('await renderPage(');
    expect(controller).not.toContain('patchCommentReactions');
  });

  test('the inline script cannot close its own script element', () => {
    expect(prefetchScript(['/api/x?q=</script>'])).not.toContain('</script>');
  });

  test('URL builders percent-encode post ids and cursors', () => {
    expect(blogCommentsUrl('a b')).toBe('/api/v2/comments?post=a%20b&limit=20');
    expect(blogCommentsUrl('p', 'c/1')).toBe('/api/v2/comments?post=p&before=c%2F1&limit=20');
    expect(reactionsUrl(['post:p', 'comment:c'])).toBe('/api/v2/reactions?targets=post%3Ap%2Ccomment%3Ac');
    expect(moodCommentsUrl('12', 'x')).toBe('/api/comments?postId=12&before=x');
  });
});
