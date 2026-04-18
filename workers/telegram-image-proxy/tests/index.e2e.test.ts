import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import worker, { type Env, type NotifyDispatchJob } from '../src/index';

type StoredObject = {
  bytes: Uint8Array;
  contentType: string;
  cacheControl: string;
};

interface R2ObjectBody {
  body: ReadableStream<Uint8Array> | null;
  httpEtag: string;
  writeHttpMetadata(headers: Headers): void;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
  readonly props?: unknown;
}

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
      body: new Response(Buffer.from(found.bytes)).body,
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

  read(key: string): StoredObject | null {
    return this.objects.get(key) ?? null;
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

class FakeNotifyDispatchQueue {
  readonly messages: NotifyDispatchJob[] = [];
  failSend = false;

  async send(message: NotifyDispatchJob): Promise<void> {
    if (this.failSend) {
      throw new Error('Queue send failed');
    }
    this.messages.push(message);
  }
}

class FakeExecutionContext implements ExecutionContext {
  private readonly tasks: Promise<unknown>[] = [];
  readonly props: unknown = undefined;

  passThroughOnException(): void {
    // no-op for tests
  }

  waitUntil(promise: Promise<unknown>): void {
    this.tasks.push(promise);
  }

  async drain(): Promise<void> {
    const settled = await Promise.allSettled(this.tasks);
    const rejected = settled.find((entry) => entry.status === 'rejected');
    if (rejected?.status === 'rejected') {
      throw rejected.reason;
    }
  }
}

type FakeEnv = {
  TELEGRAM_BOT_TOKEN: string;
  HD_IMAGE_INGEST_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  NOTIFY_DISPATCH_SECRET: string;
  NOTIFY_DISPATCH_URL: string;
  CHANNEL: string;
  TELEGRAM_CHANNEL_ID: string;
  TELEGRAM_HOST: string;
  MOOD_IMAGES: FakeR2Bucket;
  NOTIFY_DISPATCH_QUEUE: FakeNotifyDispatchQueue;
};

type FetchHandler = (url: URL, init?: RequestInit) => Promise<Response | null>;

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
    TELEGRAM_WEBHOOK_SECRET: 'test-webhook-secret',
    NOTIFY_DISPATCH_SECRET: 'test-dispatch-secret',
    NOTIFY_DISPATCH_URL: 'https://buxx.me/api/notify/dispatch',
    CHANNEL: 'tutumood',
    TELEGRAM_CHANNEL_ID: '-100100',
    TELEGRAM_HOST: 't.me',
    MOOD_IMAGES: new FakeR2Bucket(),
    NOTIFY_DISPATCH_QUEUE: new FakeNotifyDispatchQueue(),
    ...overrides,
  };
}

function registerTelegramImageHandlers(fetchMock: FetchMock, filePaths: Record<string, string>, failingFileIds: string[] = []): void {
  fetchMock.register(async (url, init) => {
    if (url.hostname === 'api.telegram.org' && url.pathname.includes('/getFile')) {
      const fileId = url.searchParams.get('file_id') ?? '';
      const filePath = filePaths[fileId];
      if (!filePath) {
        return new Response(JSON.stringify({ ok: false, description: 'missing test file path' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        ok: true,
        result: {
          file_id: fileId,
          file_unique_id: `unique-${fileId}`,
          file_path: filePath,
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.hostname === 'api.telegram.org' && url.pathname.includes('/file/bot')) {
      const fileName = url.pathname.split('/').pop() ?? '';
      const fileId = Object.entries(filePaths).find(([, filePath]) => filePath.endsWith(fileName))?.[0] ?? '';
      if (failingFileIds.includes(fileId)) {
        return new Response('upstream failed', { status: 502 });
      }

      const width = (init as RequestInit & { cf?: { image?: { width?: number } } })?.cf?.image?.width;
      const bytes = width ? [width % 255, 2, 3, 4] : [1, 2, 3, 4];
      return new Response(new Uint8Array(bytes), {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      });
    }

    return null;
  });
}

function registerWorkerPublicImageHandler(fetchMock: FetchMock, env: FakeEnv): void {
  fetchMock.register(async (url, init) => {
    if (url.hostname !== 'image.example.test') {
      return null;
    }

    const moodMatch = url.pathname.match(/^\/mood\/(\d+)\/(\d+)$/);
    const objectKey = moodMatch
      ? `mood/${moodMatch[1]}/${moodMatch[2]}`
      : url.pathname === '/channel/avatar'
        ? 'channel/avatar'
        : '';

    if (!objectKey) {
      return null;
    }

    const stored = env.MOOD_IMAGES.read(objectKey);
    if (!stored) {
      return new Response('missing original', { status: 404 });
    }

    const width = (init as RequestInit & { cf?: { image?: { width?: number } } })?.cf?.image?.width;
    const bytes = width
      ? new Uint8Array([width % 255, 9, 8, 7])
      : stored.bytes;

    return new Response(Uint8Array.from(bytes), {
      status: 200,
      headers: { 'Content-Type': stored.contentType },
    });
  });
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

    registerTelegramImageHandlers(fetchMock, {
      'file-id-1': 'photos/file_1.jpg',
    });
    registerWorkerPublicImageHandler(fetchMock, env);

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
    expect(response.status).toBe(200);

    expect(env.MOOD_IMAGES.has('mood/123/0')).toBe(true);
    expect(env.MOOD_IMAGES.has('mood/123/0@w480')).toBe(true);
    expect(env.MOOD_IMAGES.has('mood/123/0@w800')).toBe(true);
    expect(env.MOOD_IMAGES.has('mood/123/0@w1200')).toBe(true);
    expect(env.MOOD_IMAGES.has('mood/123/0@w1600')).toBe(true);
  });

  test('webhook rejects invalid secret', async () => {
    const env = createEnv();
    const ctx = new FakeExecutionContext();

    const request = new Request('https://image.example.test/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'invalid-secret',
      },
      body: JSON.stringify({ update_id: 1 }),
    });

    const response = await worker.fetch(request, env as unknown as Env, ctx);
    expect(response.status).toBe(401);
  });

  test('webhook ingests photo, refreshes avatar, and queues notify handoff', async () => {
    const env = createEnv();
    const ctx = new FakeExecutionContext();
    const fetchMock = new FetchMock();

    registerTelegramImageHandlers(fetchMock, {
      'mood-file-1': 'photos/mood_1.jpg',
      'avatar-file-1': 'photos/avatar_1.jpg',
    });
    registerWorkerPublicImageHandler(fetchMock, env);

    globalThis.fetch = fetchMock.fetch as typeof fetch;

    const request = new Request('https://image.example.test/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': env.TELEGRAM_WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        update_id: 1,
        channel_post: {
          message_id: 4001,
          photo: [
            { file_id: 'mood-file-1', file_unique_id: 'u1', width: 100, height: 100 },
          ],
          chat: {
            id: '-100100',
            photo: {
              big_file_id: 'avatar-file-1',
            },
          },
        },
      }),
    });

    const response = await worker.fetch(request, env as unknown as Env, ctx);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('OK');

    expect(env.MOOD_IMAGES.has('mood/4001/0')).toBe(true);
    expect(env.MOOD_IMAGES.has('channel/avatar')).toBe(true);
    expect(env.NOTIFY_DISPATCH_QUEUE.messages).toEqual([
      {
        postId: '4001',
        deliveryModes: ['immediate'],
        source: 'telegram-webhook',
      },
    ]);
  });

  test('webhook ingests a static cover for video-backed media when no photo exists', async () => {
    const env = createEnv({ TELEGRAM_CHANNEL_ID: '' });
    const ctx = new FakeExecutionContext();
    const fetchMock = new FetchMock();

    registerTelegramImageHandlers(fetchMock, {
      'video-cover-1': 'photos/video_cover_1.jpg',
    });
    registerWorkerPublicImageHandler(fetchMock, env);

    globalThis.fetch = fetchMock.fetch as typeof fetch;

    const request = new Request('https://image.example.test/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': env.TELEGRAM_WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        update_id: 11,
        channel_post: {
          message_id: 4400,
          video: {
            cover: [
              { file_id: 'video-cover-1', file_unique_id: 'vc1', width: 1280, height: 720 },
            ],
          },
        },
      }),
    });

    const response = await worker.fetch(request, env as unknown as Env, ctx);
    expect(response.status).toBe(200);
    expect(env.MOOD_IMAGES.has('mood/4400/0')).toBe(true);
    expect(env.NOTIFY_DISPATCH_QUEUE.messages[0]?.postId).toBe('4400');
  });

  test('webhook resolves media-group items back to the root post id', async () => {
    const env = createEnv({ TELEGRAM_CHANNEL_ID: '' });
    const ctx = new FakeExecutionContext();
    const fetchMock = new FetchMock();

    fetchMock.register(async (url) => {
      if (url.hostname === 't.me') {
        return new Response(`
          <div class="tgme_widget_message" data-post="tutumood/3191">
            <a class="tgme_widget_message_photo_wrap" href="https://t.me/tutumood/3190?single"></a>
            <a class="tgme_widget_message_photo_wrap" href="https://t.me/tutumood/3191?single"></a>
          </div>
        `, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }
      return null;
    });

    registerTelegramImageHandlers(fetchMock, {
      'album-file-2': 'photos/album_2.jpg',
    });
    registerWorkerPublicImageHandler(fetchMock, env);

    globalThis.fetch = fetchMock.fetch as typeof fetch;

    const request = new Request('https://image.example.test/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': env.TELEGRAM_WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        update_id: 2,
        channel_post: {
          message_id: 3191,
          media_group_id: 'group-1',
          photo: [
            { file_id: 'album-file-2', file_unique_id: 'u2', width: 100, height: 100 },
          ],
        },
      }),
    });

    const response = await worker.fetch(request, env as unknown as Env, ctx);
    expect(response.status).toBe(200);

    expect(env.MOOD_IMAGES.has('mood/3190/1')).toBe(true);
    expect(env.NOTIFY_DISPATCH_QUEUE.messages[0]?.postId).toBe('3190');
  });

  test('webhook resolves video-wrapped media-group items back to the root post id', async () => {
    const env = createEnv({ TELEGRAM_CHANNEL_ID: '' });
    const ctx = new FakeExecutionContext();
    const fetchMock = new FetchMock();

    fetchMock.register(async (url) => {
      if (url.hostname === 't.me') {
        return new Response(`
          <div class="tgme_widget_message" data-post="tutumood/5301">
            <a class="tgme_widget_message_video_wrap" href="https://t.me/tutumood/5300?single"></a>
            <a class="tgme_widget_message_video_wrap" href="https://t.me/tutumood/5301?single"></a>
          </div>
        `, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }
      return null;
    });

    registerTelegramImageHandlers(fetchMock, {
      'video-cover-2': 'photos/video_cover_2.jpg',
    });
    registerWorkerPublicImageHandler(fetchMock, env);

    globalThis.fetch = fetchMock.fetch as typeof fetch;

    const request = new Request('https://image.example.test/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': env.TELEGRAM_WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        update_id: 12,
        channel_post: {
          message_id: 5301,
          media_group_id: 'group-video-1',
          video: {
            cover: [
              { file_id: 'video-cover-2', file_unique_id: 'vc2', width: 1280, height: 720 },
            ],
          },
        },
      }),
    });

    const response = await worker.fetch(request, env as unknown as Env, ctx);
    expect(response.status).toBe(200);
    expect(env.MOOD_IMAGES.has('mood/5300/1')).toBe(true);
    expect(env.NOTIFY_DISPATCH_QUEUE.messages[0]?.postId).toBe('5300');
  });

  test('webhook returns 200 on image ingest failure and still queues notify', async () => {
    const env = createEnv({ TELEGRAM_CHANNEL_ID: '' });
    const ctx = new FakeExecutionContext();
    const fetchMock = new FetchMock();

    registerTelegramImageHandlers(fetchMock, {
      'broken-file-1': 'photos/broken_1.jpg',
    }, ['broken-file-1']);

    globalThis.fetch = fetchMock.fetch as typeof fetch;

    const request = new Request('https://image.example.test/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': env.TELEGRAM_WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        update_id: 3,
        channel_post: {
          message_id: 4100,
          photo: [
            { file_id: 'broken-file-1', file_unique_id: 'u3', width: 100, height: 100 },
          ],
        },
      }),
    });

    const response = await worker.fetch(request, env as unknown as Env, ctx);
    expect(response.status).toBe(200);
    expect(env.MOOD_IMAGES.has('mood/4100/0')).toBe(false);
    expect(env.NOTIFY_DISPATCH_QUEUE.messages[0]?.postId).toBe('4100');
  });

  test('webhook returns 503 when notify queue handoff fails', async () => {
    const env = createEnv({ TELEGRAM_CHANNEL_ID: '' });
    env.NOTIFY_DISPATCH_QUEUE.failSend = true;
    const ctx = new FakeExecutionContext();

    const request = new Request('https://image.example.test/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': env.TELEGRAM_WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        update_id: 4,
        channel_post: {
          message_id: 4200,
        },
      }),
    });

    const response = await worker.fetch(request, env as unknown as Env, ctx);
    expect(response.status).toBe(503);
  });

  test('queue consumer dispatches notify jobs to the site endpoint', async () => {
    const env = createEnv();
    const ctx = new FakeExecutionContext();
    const fetchMock = new FetchMock();
    const calls: Array<{ url: string; auth: string; body: string }> = [];

    fetchMock.register(async (url, init) => {
      if (url.toString() === env.NOTIFY_DISPATCH_URL) {
        calls.push({
          url: url.toString(),
          auth: (init?.headers as Record<string, string>)?.Authorization ?? '',
          body: String(init?.body ?? ''),
        });
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return null;
    });

    globalThis.fetch = fetchMock.fetch as typeof fetch;

    await worker.queue({
      messages: [
        {
          body: {
            postId: '5000',
            deliveryModes: ['immediate'],
            source: 'telegram-webhook',
          },
        },
      ],
    }, env as unknown as Env);

    expect(calls).toEqual([
      {
        url: 'https://buxx.me/api/notify/dispatch',
        auth: `Bearer ${env.NOTIFY_DISPATCH_SECRET}`,
        body: JSON.stringify({ postId: '5000', deliveryModes: ['immediate'] }),
      },
    ]);
  });

  test('read endpoint serves existing R2 object', async () => {
    const env = createEnv();
    const ctx = new FakeExecutionContext();
    const fetchMock = new FetchMock();
    registerWorkerPublicImageHandler(fetchMock, env);
    globalThis.fetch = fetchMock.fetch as typeof fetch;
    await env.MOOD_IMAGES.put('mood/200/0', new Uint8Array([10, 20, 30]), {
      httpMetadata: {
        contentType: 'image/jpeg',
        cacheControl: 'public, max-age=31536000, immutable, no-transform',
      },
    });

    const request = new Request('https://image.example.test/mood/200/0?w=1200', { method: 'GET' });
    const response = await worker.fetch(request, env as unknown as Env, ctx);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('image/jpeg');
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
    expect(env.MOOD_IMAGES.has('mood/200/0@w1200')).toBe(true);
  });

  test('read endpoint repairs a missing width variant from the stored original', async () => {
    const env = createEnv();
    const ctx = new FakeExecutionContext();
    const fetchMock = new FetchMock();
    registerWorkerPublicImageHandler(fetchMock, env);
    globalThis.fetch = fetchMock.fetch as typeof fetch;

    await env.MOOD_IMAGES.put('mood/201/0', new Uint8Array([10, 20, 30]), {
      httpMetadata: {
        contentType: 'image/jpeg',
        cacheControl: 'public, max-age=31536000, immutable, no-transform',
      },
    });

    const request = new Request('https://image.example.test/mood/201/0?w=96', { method: 'GET' });
    const response = await worker.fetch(request, env as unknown as Env, ctx);
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(Array.from(bytes)).toEqual([225, 9, 8, 7]);
    expect(env.MOOD_IMAGES.has('mood/201/0@w480')).toBe(true);
  });

  test('read endpoint returns 404 on R2 miss without telegram fallback fetch', async () => {
    const env = createEnv();
    const ctx = new FakeExecutionContext();
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      throw new Error('Unexpected fetch');
    }) as unknown as typeof fetch;

    const request = new Request('https://image.example.test/mood/999/0?w=1200', { method: 'GET' });
    const response = await worker.fetch(request, env as unknown as Env, ctx);

    expect(response.status).toBe(404);
    expect(await response.text()).toContain('Image not available');
    expect(fetchCalls).toBe(0);
  });

  test('read endpoint returns 404 for HEAD on R2 miss', async () => {
    const env = createEnv();
    const ctx = new FakeExecutionContext();

    const request = new Request('https://image.example.test/mood/1000/0?w=1200', { method: 'HEAD' });
    const response = await worker.fetch(request, env as unknown as Env, ctx);

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('');
  });
});
