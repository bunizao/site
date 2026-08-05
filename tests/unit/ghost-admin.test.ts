import { describe, expect, test } from 'bun:test';
import { decodeProtectedHeader, jwtVerify } from 'jose';

import { createGhostAdminClient } from '@/features/posts/server/ghost-admin';

const ADMIN_KEY_ID = '0123456789abcdef01234567';
const ADMIN_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const ADMIN_KEY = `${ADMIN_KEY_ID}:${ADMIN_SECRET}`;
const POST_ID = '5ddc9141c35e7700383b2937';
const POST_UUID = 'a5aa9bd8-ea31-415c-b452-3040dae1e730';
const NOW_MS = Date.UTC(2026, 6, 31, 12, 0, 0);

function decodeHex(value: string): Uint8Array {
  return Uint8Array.from(value.match(/.{2}/gu) ?? [], (pair) => Number.parseInt(pair, 16));
}

describe('Ghost Admin client', () => {
  test('signs an ID lookup with the Ghost Admin JWT contract', async () => {
    let requestUrl = '';
    let requestInit: RequestInit | undefined;
    const client = createGhostAdminClient({
      url: 'https://blog.example.test/',
      adminApiKey: ADMIN_KEY,
      now: () => NOW_MS,
      fetch: async (input, init) => {
        requestUrl = String(input);
        requestInit = init;

        return Response.json({
          posts: [{
            id: POST_ID,
            uuid: POST_UUID,
            slug: 'draft-post',
            title: 'Draft post',
            html: '<p>Draft body</p>',
            status: 'draft',
            updated_at: '2026-07-31T11:59:00.000Z',
          }],
        });
      },
    });

    const post = await client.readPostById(POST_ID);
    const requestHeaders = new Headers(requestInit?.headers);
    const authorization = requestHeaders.get('Authorization') ?? '';
    const token = authorization.replace(/^Ghost /u, '');
    const verified = await jwtVerify(token, decodeHex(ADMIN_SECRET), {
      algorithms: ['HS256'],
      audience: '/admin/',
      currentDate: new Date(NOW_MS),
    });

    expect(requestUrl).toBe(
      `https://blog.example.test/ghost/api/admin/posts/${POST_ID}/?formats=html`,
    );
    expect(requestInit?.method).toBe('GET');
    expect(requestInit?.redirect).toBe('manual');
    expect(requestInit?.cache).toBe('no-store');
    expect(requestHeaders.get('Accept')).toBe('application/json');
    expect(requestHeaders.get('Accept-Version')).toBe('v6.0');
    expect(authorization.startsWith('Ghost ')).toBe(true);
    expect(decodeProtectedHeader(token)).toEqual({
      alg: 'HS256',
      kid: ADMIN_KEY_ID,
      typ: 'JWT',
    });
    expect(verified.payload.aud).toBe('/admin/');
    expect(verified.payload.iat).toBe(NOW_MS / 1000);
    expect(verified.payload.exp).toBe(NOW_MS / 1000 + 300);
    expect(post).toEqual({
      id: POST_ID,
      uuid: POST_UUID,
      slug: 'draft-post',
      title: 'Draft post',
      html: '<p>Draft body</p>',
      status: 'draft',
      updatedAt: '2026-07-31T11:59:00.000Z',
    });
    expect(requestUrl).not.toContain(ADMIN_KEY_ID);
    expect(requestUrl).not.toContain(ADMIN_SECRET);
    expect(authorization).not.toContain(ADMIN_KEY);
    expect(authorization).not.toContain(ADMIN_SECRET);
    expect(JSON.stringify(client)).not.toContain(ADMIN_SECRET);
    expect(JSON.stringify(post)).not.toContain(ADMIN_SECRET);
  });

  test('rejects UUIDs at the editor post ID lookup seam', async () => {
    let didFetch = false;
    const client = createGhostAdminClient({
      url: 'https://blog.example.test',
      adminApiKey: ADMIN_KEY,
      fetch: async () => {
        didFetch = true;
        return Response.json({ posts: [] });
      },
    });

    try {
      await client.readPostById(POST_UUID);
      throw new Error('Expected the UUID lookup to fail');
    } catch (error) {
      expect(error).toMatchObject({
        name: 'GhostAdminClientError',
        code: 'invalid_identifier',
        message: 'Invalid Ghost Admin post ID.',
      });
    }
    expect(didFetch).toBe(false);
  });

  test('reads the Admin key from server runtime configuration', async () => {
    let requestUrl = '';
    const client = createGhostAdminClient({
      locals: {
        env: {
          PUBLIC_GHOST_URL: 'https://runtime-blog.example.test',
          GHOST_ADMIN_API_KEY: ADMIN_KEY,
        },
      },
      now: () => NOW_MS,
      fetch: async (input) => {
        requestUrl = String(input);
        return Response.json({
          posts: [{
            id: POST_ID,
            uuid: POST_UUID,
            slug: 'runtime-draft',
            title: 'Runtime draft',
            html: '',
            status: 'draft',
          }],
        });
      },
    });

    const post = await client.readPostById(POST_ID);

    expect(requestUrl).toStartWith('https://runtime-blog.example.test/ghost/api/admin/');
    expect(post.title).toBe('Runtime draft');
    expect(JSON.stringify(client)).not.toContain(ADMIN_KEY);
  });

  test('fails closed with a sanitized malformed-key error', () => {
    const malformedKey = `${ADMIN_KEY_ID}:${ADMIN_SECRET}00`;

    try {
      createGhostAdminClient({
        url: 'https://blog.example.test',
        adminApiKey: malformedKey,
      });
      throw new Error('Expected malformed configuration to fail');
    } catch (error) {
      expect(error).toMatchObject({
        name: 'GhostAdminClientError',
        code: 'invalid_configuration',
        message: 'Invalid Ghost Admin configuration.',
      });
      expect(String(error)).not.toContain(malformedKey);
      expect(String(error)).not.toContain(ADMIN_SECRET);
    }
  });

  test('rejects Ghost origins that could place credentials in request URLs', () => {
    const unsafeUrl = `https://${ADMIN_KEY_ID}:${ADMIN_SECRET}@blog.example.test`;

    try {
      createGhostAdminClient({
        url: unsafeUrl,
        adminApiKey: ADMIN_KEY,
      });
      throw new Error('Expected the unsafe Ghost URL to fail');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'invalid_configuration',
        message: 'Invalid Ghost Admin configuration.',
      });
      expect(String(error)).not.toContain(ADMIN_SECRET);
      expect(String(error)).not.toContain(unsafeUrl);
    }
  });

  test('aborts a bounded Ghost request with a sanitized timeout error', async () => {
    const client = createGhostAdminClient({
      url: 'https://blog.example.test',
      adminApiKey: ADMIN_KEY,
      timeoutMs: 5,
      fetch: async (_input, init) => new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        const fallback = setTimeout(() => reject(new Error('Fetch did not abort')), 100);

        signal?.addEventListener('abort', () => {
          clearTimeout(fallback);
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      }),
    });

    try {
      await client.readPostById(POST_ID);
      throw new Error('Expected the Ghost request to time out');
    } catch (error) {
      expect(error).toMatchObject({
        name: 'GhostAdminClientError',
        code: 'timeout',
        message: 'Ghost Admin request timed out.',
      });
      expect(String(error)).not.toContain(ADMIN_KEY);
      expect(String(error)).not.toContain(ADMIN_SECRET);
    }
  });

  test('reports redirects without forwarding the Admin credential', async () => {
    const upstreamResponse = new Response(null, {
      status: 302,
      headers: { Location: 'https://other.example.test/ghost/' },
    });
    let requestInit: RequestInit | undefined;
    const client = createGhostAdminClient({
      url: 'https://blog.example.test',
      adminApiKey: ADMIN_KEY,
      fetch: async (_input, init) => {
        requestInit = init;
        return upstreamResponse;
      },
    });

    try {
      await client.readPostById(POST_ID);
      throw new Error('Expected the redirected request to fail');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'request_failed',
        status: 302,
        message: 'Ghost Admin request failed.',
      });
    }
    expect(requestInit?.redirect).toBe('manual');
    expect(upstreamResponse.bodyUsed).toBe(false);
  });

  test('does not surface or consume upstream error bodies', async () => {
    const upstreamResponse = new Response(`upstream leaked ${ADMIN_KEY}`, {
      status: 502,
    });
    const client = createGhostAdminClient({
      url: 'https://blog.example.test',
      adminApiKey: ADMIN_KEY,
      fetch: async () => upstreamResponse,
    });

    try {
      await client.readPostById(POST_ID);
      throw new Error('Expected the Ghost request to fail');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'request_failed',
        status: 502,
        message: 'Ghost Admin request failed.',
      });
      expect(String(error)).not.toContain(ADMIN_KEY);
      expect(String(error)).not.toContain(ADMIN_SECRET);
    }
    expect(upstreamResponse.bodyUsed).toBe(false);
  });

  test('maps malformed success payloads to a sanitized response error', async () => {
    const client = createGhostAdminClient({
      url: 'https://blog.example.test',
      adminApiKey: ADMIN_KEY,
      fetch: async () => new Response(`{"leaked":"${ADMIN_SECRET}"`, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    });

    try {
      await client.readPostById(POST_ID);
      throw new Error('Expected the malformed response to fail');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'invalid_response',
        message: 'Ghost Admin returned an invalid response.',
      });
      expect(String(error)).not.toContain(ADMIN_SECRET);
    }
  });

  test('maps an empty post result to a sanitized response error', async () => {
    const client = createGhostAdminClient({
      url: 'https://blog.example.test',
      adminApiKey: ADMIN_KEY,
      fetch: async () => Response.json({ posts: [] }),
    });

    try {
      await client.readPostById(POST_ID);
      throw new Error('Expected the empty response to fail');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'invalid_response',
        message: 'Ghost Admin returned an invalid response.',
      });
    }
  });

  test('rejects nonconforming or mismatched post records', async () => {
    const invalidPosts = [
      {
        id: POST_ID,
        uuid: POST_UUID,
        slug: 'missing-html',
        title: 'Missing HTML',
        status: 'draft',
      },
      {
        id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        uuid: POST_UUID,
        slug: 'wrong-post',
        title: 'Wrong post',
        html: '<p>Wrong post</p>',
        status: 'draft',
      },
    ];

    for (const post of invalidPosts) {
      const client = createGhostAdminClient({
        url: 'https://blog.example.test',
        adminApiKey: ADMIN_KEY,
        fetch: async () => Response.json({ posts: [post] }),
      });

      try {
        await client.readPostById(POST_ID);
        throw new Error('Expected the invalid post to fail');
      } catch (error) {
        expect(error).toMatchObject({
          code: 'invalid_response',
          message: 'Ghost Admin returned an invalid response.',
        });
      }
    }
  });

  test('distinguishes a missing post without exposing the upstream body', async () => {
    const upstreamResponse = new Response(`missing ${ADMIN_SECRET}`, { status: 404 });
    const client = createGhostAdminClient({
      url: 'https://blog.example.test',
      adminApiKey: ADMIN_KEY,
      fetch: async () => upstreamResponse,
    });

    try {
      await client.readPostById(POST_ID);
      throw new Error('Expected the missing post to fail');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'not_found',
        status: 404,
        message: 'Ghost Admin post was not found.',
      });
      expect(String(error)).not.toContain(ADMIN_SECRET);
    }
    expect(upstreamResponse.bodyUsed).toBe(false);
  });

  test('rejects oversized success payloads before consuming the body', async () => {
    const upstreamResponse = new Response('{"posts":[]}', {
      headers: {
        'Content-Length': '129',
        'Content-Type': 'application/json',
      },
    });
    const client = createGhostAdminClient({
      url: 'https://blog.example.test',
      adminApiKey: ADMIN_KEY,
      maxResponseBytes: 128,
      fetch: async () => upstreamResponse,
    });

    try {
      await client.readPostById(POST_ID);
      throw new Error('Expected the oversized response to fail');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'invalid_response',
        message: 'Ghost Admin returned an invalid response.',
      });
    }
    expect(upstreamResponse.bodyUsed).toBe(false);
  });

  test('bounds streamed payloads without a Content-Length header', async () => {
    const client = createGhostAdminClient({
      url: 'https://blog.example.test',
      adminApiKey: ADMIN_KEY,
      maxResponseBytes: 128,
      fetch: async () => Response.json({
        posts: [{
          id: POST_ID,
          uuid: POST_UUID,
          slug: 'large-draft',
          title: 'Large draft',
          html: `<p>${'x'.repeat(256)}</p>`,
          status: 'draft',
        }],
      }),
    });

    try {
      await client.readPostById(POST_ID);
      throw new Error('Expected the streamed response to exceed the limit');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'invalid_response',
        message: 'Ghost Admin returned an invalid response.',
      });
    }
  });

  test('keeps the timeout active while reading the response body', async () => {
    const client = createGhostAdminClient({
      url: 'https://blog.example.test',
      adminApiKey: ADMIN_KEY,
      timeoutMs: 5,
      fetch: async () => new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"posts":['));
          setTimeout(() => controller.error(new Error('Body did not abort')), 100);
        },
      })),
    });

    try {
      await client.readPostById(POST_ID);
      throw new Error('Expected the Ghost response body to time out');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'timeout',
        message: 'Ghost Admin request timed out.',
      });
    }
  });
});
