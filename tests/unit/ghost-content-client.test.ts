import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { getGhostClient } from '@/features/posts/adapter/ghost/client';
import { createGhostContentProvider } from '@/features/posts/adapter/provider';

const syntheticKey = '0123456789abcdef0123456789';
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function client() {
  return getGhostClient({
    url: 'https://ghost.test.invalid', key: syntheticKey,
    mockContent: false, forceMockContent: false,
  })!;
}

describe('Ghost Content native fetch transport', () => {
  test('preserves SDK parameters, headers, collection metadata and Worker-compatible init', async () => {
    const requests: Request[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.cache).toBeUndefined();
      expect(init?.credentials).toBeUndefined();
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      requests.push(new Request(input, init));
      return Response.json({ posts: [{ id: 'one' }], meta: { pagination: { total: 1 } } });
    }) as unknown as typeof fetch;

    const posts = await client().posts.browse({ include: 'authors,tags', formats: ['html', 'plaintext'], limit: 'all', order: 'published_at desc' });
    expect(posts).toHaveLength(1);
    expect(posts.meta?.pagination?.total).toBe(1);
    const request = requests[0]!;
    const url = new URL(request.url);
    expect(url.pathname).toBe('/ghost/api/content/posts/');
    expect(url.searchParams.get('key')).toBe(syntheticKey);
    expect(url.searchParams.get('include')).toBe('authors,tags');
    expect(url.searchParams.get('formats')).toBe('html,plaintext');
    expect(url.searchParams.get('limit')).toBe('all');
    expect(url.searchParams.get('order')).toBe('published_at desc');
    expect(request.headers.get('Accept-Version')).toBe('v6.0');
    expect(request.headers.get('User-Agent')).toContain('GhostContentSDK/');
  });

  test('invalid credentials do not appear in SDK constructor errors', () => {
    expect(() => getGhostClient({ url: 'https://ghost.test.invalid', key: 'malformed-secret-value' }))
      .toThrow('Ghost Content configuration is invalid.');
  });

  test('preserves SDK settings normalization', async () => {
    globalThis.fetch = (async () => Response.json({ settings: { title: 'Public blog', url: 'https://blog.example' } })) as unknown as typeof fetch;
    expect(await client().settings.browse()).toEqual({ title: 'Public blog', url: 'https://blog.example' });
  });

  test('retains status and safe SDK error fields without exposing request secrets', async () => {
    globalThis.fetch = (async () => Response.json({
      errors: [{
        message: `Bad key ${syntheticKey}`, type: 'NotFoundError', code: 'NOT_FOUND',
        context: `https://ghost.test.invalid/?key=${syntheticKey}`,
      }],
    }, { status: 404 })) as unknown as typeof fetch;
    const error = await client().posts.browse().catch((value) => value);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('NotFoundError');
    expect(error.code).toBe('NOT_FOUND');
    expect(error.response.status).toBe(404);
    expect(error.response.data.errors).toHaveLength(1);
    expect(JSON.stringify(error)).not.toContain(syntheticKey);
    expect(JSON.stringify(error)).not.toContain('https://');
    expect(error.message).not.toContain(syntheticKey);
  });

  test('hides network exception URLs and rejects invalid success bodies', async () => {
    globalThis.fetch = (async () => { throw new Error(`Request https://ghost.test.invalid/?key=${syntheticKey} failed`); }) as unknown as typeof fetch;
    await expect(client().posts.browse()).rejects.toThrow('Ghost Content request failed.');
    globalThis.fetch = (async () => new Response('invalid JSON')) as unknown as typeof fetch;
    await expect(client().posts.browse()).rejects.toThrow('Ghost Content returned an invalid response.');
  });

  test('bounds requests and reports timeout without exposing request metadata', async () => {
    const controller = new AbortController();
    controller.abort();
    const timeoutSpy = spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    try {
      globalThis.fetch = (async () => { throw new Error('aborted'); }) as unknown as typeof fetch;
      await expect(client().posts.browse()).rejects.toThrow('Ghost Content request timed out.');
      expect(timeoutSpy).toHaveBeenCalledWith(10_000);
    } finally {
      timeoutSpy.mockRestore();
    }
  });
});

test('a transient dataset failure does not poison the provider permanently', async () => {
  const provider = createGhostContentProvider({
    url: 'https://retry-ghost.test.invalid', key: syntheticKey,
    mockContent: false, forceMockContent: false,
  });
  let requests = 0;
  globalThis.fetch = (async () => { requests += 1; throw new Error('temporary upstream failure'); }) as unknown as typeof fetch;
  await expect(provider.getListedPosts()).rejects.toThrow('Ghost Content request failed.');
  expect(requests).toBe(4);

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requests += 1;
    const resource = new URL(input instanceof Request ? input.url : String(input)).pathname.split('/').filter(Boolean).at(-1)!;
    return Response.json(resource === 'settings' ? { settings: { url: 'https://retry-ghost.test.invalid' } } : { [resource]: [], meta: {} });
  }) as unknown as typeof fetch;
  expect(await provider.getListedPosts()).toEqual([]);
  expect(requests).toBe(8);
  expect(await provider.getListedPosts()).toEqual([]);
  expect(requests).toBe(8);
});
