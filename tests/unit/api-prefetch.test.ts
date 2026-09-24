import { afterEach, describe, expect, test } from 'bun:test';
import { fetchPrefetched, prefetchScript } from '@/lib/api-prefetch';
import { blogCommentsUrl, moodCommentsUrl, reactionsUrl } from '@/features/comments/api-urls';

const realFetch = globalThis.fetch;
const realWindow = (globalThis as { window?: unknown }).window;

afterEach(() => {
  globalThis.fetch = realFetch;
  (globalThis as { window?: unknown }).window = realWindow;
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

  test('the inline script cannot close its own script element', () => {
    expect(prefetchScript(['/api/x?q=</script>'])).not.toContain('</script>');
  });

  test('URL builders match the shapes the controllers used to inline', () => {
    expect(blogCommentsUrl('a b')).toBe('/api/v2/comments?post=a%20b&limit=20');
    expect(blogCommentsUrl('p', 'c/1')).toBe('/api/v2/comments?post=p&before=c%2F1&limit=20');
    expect(reactionsUrl(['post:p', 'comment:c'])).toBe('/api/v2/reactions?targets=post%3Ap%2Ccomment%3Ac');
    expect(moodCommentsUrl('12', 'x')).toBe('/api/comments?postId=12&before=x');
  });
});
