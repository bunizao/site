import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import worker from '../src/index';

type StoredObject = {
  bytes: Uint8Array;
  contentType: string;
  cacheControl: string;
};

class FakeR2Bucket {
  private readonly objects = new Map<string, StoredObject>();

  async put(
    key: string,
    value: ReadableStream<Uint8Array> | ArrayBuffer | Uint8Array | string,
    options?: {
      httpMetadata?: {
        contentType?: string;
        cacheControl?: string;
      };
    }
  ): Promise<void> {
    const bytes = await this.toBytes(value);
    this.objects.set(key, {
      bytes,
      contentType: options?.httpMetadata?.contentType ?? 'image/jpeg',
      cacheControl: options?.httpMetadata?.cacheControl ?? '',
    });
  }

  async get(key: string): Promise<R2ObjectBody | null> {
    const found = this.objects.get(key);
    if (!found) {
      return null;
    }

    return {
      body: new Response(found.bytes).body,
      httpEtag: '"fake-etag"',
      writeHttpMetadata(headers: Headers): void {
        headers.set('Content-Type', found.contentType);
        if (found.cacheControl) {
          headers.set('Cache-Control', found.cacheControl);
        }
      },
    } as unknown as R2ObjectBody;
  }

  has(key: string): boolean {
    return this.objects.has(key);
  }

  private async toBytes(
    value: ReadableStream<Uint8Array> | ArrayBuffer | Uint8Array | string
  ): Promise<Uint8Array> {
    if (typeof value === 'string') {
      return new TextEncoder().encode(value);
    }

    if (value instanceof Uint8Array) {
      return value;
    }

    if (value instanceof ArrayBuffer) {
      return new Uint8Array(value);
    }

    return new Uint8Array(await new Response(value).arrayBuffer());
  }
}

class FakeExecutionContext implements ExecutionContext {
  private readonly tasks: Promise<unknown>[] = [];

  passThroughOnException(): void {
    // no-op for tests
  }

  waitUntil(promise: Promise<unknown>): void {
    this.tasks.push(promise);
  }

  async drain(): Promise<void> {
    await Promise.allSettled(this.tasks);
  }
}

type FakeEnv = {
  TELEGRAM_BOT_TOKEN: string;
  HD_IMAGE_INGEST_TOKEN: string;
  MOOD_IMAGES: FakeR2Bucket;
  TELEGRAM_PUBLIC_CHANNEL: string;
};

type FetchHandler = (url: URL, init?: RequestInit) => Promise<Response>;

class FetchMock {
  private readonly handlers: FetchHandler[] = [];

  register(handler: FetchHandler): void {
    this.handlers.push(handler);
  }

  fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string'
      ? new URL(input)
      : input instanceof URL
        ? input
        : new URL(input.url);

    for (const handler of this.handlers) {
      const result = await handler(url, init);
      if (result) {
        return result;
      }
    }

    throw new Error(`Unhandled fetch URL in test: ${url.toString()}`);
  };
}

function createEnv(overrides?: Partial<FakeEnv>): FakeEnv {
  return {
    TELEGRAM_BOT_TOKEN: 'test-bot-token',
    HD_IMAGE_INGEST_TOKEN: 'test-ingest-token',
    MOOD_IMAGES: new FakeR2Bucket(),
    TELEGRAM_PUBLIC_CHANNEL: 'tutumood',
    ...overrides,
  };
}

function createTelegramPostHtml(channel: string, postId: string, imageUrl: string): string {
  return `
    <div class="tgme_widget_message_wrap">
      <div class="tgme_widget_message" data-post="${channel}/${postId}">
        <a class="tgme_widget_message_photo_wrap" style="background-image:url('${imageUrl}')"></a>
      </div>
    </div>
  `;
}

const originalFetch = globalThis.fetch;
const originalCaches = globalThis.caches;

beforeEach(() => {
  const cacheStore = new Map<string, Response>();
  (globalThis as Record<string, unknown>).caches = {
    default: {
      async match(request: Request): Promise<Response | null> {
        return cacheStore.get(request.url) ?? null;
      },
      async put(request: Request, response: Response): Promise<void> {
        cacheStore.set(request.url, response);
      },
      async delete(request: Request): Promise<boolean> {
        return cacheStore.delete(request.url);
      },
    },
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  (globalThis as Record<string, unknown>).caches = originalCaches;
});

describe('telegram image worker e2e', () => {
  test('ingest endpoint writes original and variants to R2', async () => {
    const env = createEnv();
    const ctx = new FakeExecutionContext();
    const fetchMock = new FetchMock();
    const variantWidths: number[] = [];

    fetchMock.register(async (url, init) => {
      if (url.hostname === 'api.telegram.org' && url.pathname.includes('/getFile')) {
        return new Response(JSON.stringify({
          ok: true,
          result: {
            file_id: 'file-id-1',
            file_unique_id: 'unique-id-1',
            file_path: 'photos/file_1.jpg',
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.hostname === 'api.telegram.org' && url.pathname.includes('/file/bot')) {
        const width = (init as RequestInit & { cf?: { image?: { width?: number } } })?.cf?.image?.width;
        if (width) {
          variantWidths.push(width);
        }
        return new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        });
      }

      return null as unknown as Response;
    });

    globalThis.fetch = fetchMock.fetch as typeof fetch;

    const request = new Request('https://image.example.test/ingest/mood/123/0', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.HD_IMAGE_INGEST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fileId: 'file-id-1' }),
    });

    const response = await worker.fetch(request, env as unknown as Env, ctx);
    expect(response.status).toBe(202);

    await ctx.drain();

    expect(env.MOOD_IMAGES.has('mood/123/0')).toBe(true);
    expect(env.MOOD_IMAGES.has('mood/123/0@w480')).toBe(true);
    expect(env.MOOD_IMAGES.has('mood/123/0@w800')).toBe(true);
    expect(env.MOOD_IMAGES.has('mood/123/0@w1200')).toBe(true);
    expect(env.MOOD_IMAGES.has('mood/123/0@w1600')).toBe(true);
    expect(variantWidths.sort((a, b) => a - b)).toEqual([480, 800, 1200, 1600]);
  });

  test('read endpoint falls back to Telegram public CDN and backfills R2 on GET', async () => {
    const env = createEnv();
    const ctx = new FakeExecutionContext();
    const fetchMock = new FetchMock();
    let pageFetchCount = 0;
    let cdnFetchCount = 0;

    fetchMock.register(async (url, init) => {
      if (url.hostname === 't.me') {
        pageFetchCount += 1;
        return new Response(
          createTelegramPostHtml('tutumood', '456', 'https://cdn4.telegram-cdn.org/file/test.jpg?w=320'),
          { status: 200, headers: { 'Content-Type': 'text/html' } }
        );
      }

      if (url.hostname === 'cdn4.telegram-cdn.org') {
        cdnFetchCount += 1;
        const method = init?.method ?? 'GET';
        if (method === 'HEAD') {
          return new Response(null, {
            status: 200,
            headers: { 'Content-Type': 'image/jpeg' },
          });
        }

        return new Response(new Uint8Array([9, 8, 7, 6]), {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        });
      }

      return null as unknown as Response;
    });

    globalThis.fetch = fetchMock.fetch as typeof fetch;

    const request = new Request('https://image.example.test/mood/456/0?w=800', { method: 'GET' });
    const response = await worker.fetch(request, env as unknown as Env, ctx);
    expect(response.status).toBe(200);
    expect(await response.arrayBuffer()).toBeTruthy();

    await ctx.drain();

    expect(pageFetchCount).toBeGreaterThan(0);
    expect(cdnFetchCount).toBeGreaterThan(0);
    expect(env.MOOD_IMAGES.has('mood/456/0')).toBe(true);
    expect(env.MOOD_IMAGES.has('mood/456/0@w800')).toBe(true);
  });

  test('read endpoint fallback supports HEAD requests', async () => {
    const env = createEnv();
    const ctx = new FakeExecutionContext();
    const fetchMock = new FetchMock();

    fetchMock.register(async (url, init) => {
      if (url.hostname === 't.me') {
        return new Response(
          createTelegramPostHtml('tutumood', '789', 'https://cdn4.telegram-cdn.org/file/head.jpg?w=320'),
          { status: 200, headers: { 'Content-Type': 'text/html' } }
        );
      }

      if (url.hostname === 'cdn4.telegram-cdn.org') {
        return new Response(null, {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        });
      }

      return null as unknown as Response;
    });

    globalThis.fetch = fetchMock.fetch as typeof fetch;

    const request = new Request('https://image.example.test/mood/789/0?w=800', { method: 'HEAD' });
    const response = await worker.fetch(request, env as unknown as Env, ctx);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });

  test('returns 404 when no Telegram public image can be resolved', async () => {
    const env = createEnv();
    const ctx = new FakeExecutionContext();
    const fetchMock = new FetchMock();

    fetchMock.register(async (url) => {
      if (url.hostname === 't.me') {
        return new Response('<html><body>No media</body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      return null as unknown as Response;
    });

    globalThis.fetch = fetchMock.fetch as typeof fetch;

    const request = new Request('https://image.example.test/mood/999/0', { method: 'GET' });
    const response = await worker.fetch(request, env as unknown as Env, ctx);

    expect(response.status).toBe(404);
    expect(await response.text()).toContain('Image not available');
  });
});
