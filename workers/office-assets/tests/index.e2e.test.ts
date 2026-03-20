import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import worker, { type Env } from '../src/index';

interface R2ObjectBody {
  body: ReadableStream<Uint8Array> | null;
  writeHttpMetadata(headers: Headers): void;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

type StoredObject = {
  bytes: Uint8Array;
  contentType: string;
  cacheControl: string;
};

class FakeR2Bucket {
  private readonly objects = new Map<string, StoredObject>();

  async put(
    key: string,
    value: ReadableStream<Uint8Array> | ArrayBuffer | ArrayBufferView | Blob | string,
    options?: {
      httpMetadata?: {
        contentType?: string;
        cacheControl?: string;
      };
    },
  ): Promise<void> {
    this.objects.set(key, {
      bytes: await toBytes(value),
      contentType: options?.httpMetadata?.contentType || 'application/octet-stream',
      cacheControl: options?.httpMetadata?.cacheControl || '',
    });
  }

  async get(key: string): Promise<R2ObjectBody | null> {
    const found = this.objects.get(key);
    if (!found) {
      return null;
    }

    return {
      body: new Response(new Blob([new Uint8Array(Array.from(found.bytes))])).body,
      writeHttpMetadata(headers: Headers): void {
        headers.set('Content-Type', found.contentType);
        if (found.cacheControl) {
          headers.set('Cache-Control', found.cacheControl);
        }
      },
    };
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

class SqliteD1PreparedStatement {
  constructor(
    private readonly database: Database,
    private readonly query: string,
    private readonly values: unknown[] = [],
  ) {}

  bind(...values: unknown[]): SqliteD1PreparedStatement {
    return new SqliteD1PreparedStatement(this.database, this.query, values);
  }

  async first<T = Record<string, unknown>>(columnName?: string): Promise<T | null> {
    const row = this.database.query(this.query).get(this.values as any) as T | null | undefined;
    if (!row) {
      return null;
    }
    if (columnName) {
      return ((row as Record<string, unknown>)[columnName] as T) ?? null;
    }
    return row;
  }

  async run(): Promise<{ success: true }> {
    this.database.query(this.query).run(this.values as any);
    return { success: true };
  }

  async all<T = Record<string, unknown>>(): Promise<{ success: true; results: T[] }> {
    const rows = this.database.query(this.query).all(this.values as any) as T[];
    return { success: true, results: rows };
  }
}

class SqliteD1Database {
  constructor(private readonly database: Database) {}

  prepare(query: string): SqliteD1PreparedStatement {
    return new SqliteD1PreparedStatement(this.database, query);
  }
}

class FakeExecutionContext implements ExecutionContext {
  passThroughOnException(): void {}
  waitUntil(_promise: Promise<unknown>): void {}
}

async function toBytes(
  value: ReadableStream<Uint8Array> | ArrayBuffer | ArrayBufferView | Blob | string,
): Promise<Uint8Array> {
  if (typeof value === 'string') {
    return new TextEncoder().encode(value);
  }
  if (value instanceof Blob) {
    return new Uint8Array(await value.arrayBuffer());
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  }
  return new Uint8Array(await new Response(value).arrayBuffer());
}

function createEnv(database: Database): Env {
  return {
    OFFICE_ASSETS_BUCKET: new FakeR2Bucket(),
    OFFICE_ASSETS_DB: new SqliteD1Database(database) as unknown as Env['OFFICE_ASSETS_DB'],
    OFFICE_DEFAULT_ROOM_ID: 'demo-room',
    OFFICE_RUNTIME_STATIC_BASE_URL: 'https://office-static.example/office-runtime/static',
    OFFICE_ASSETS_AUTH_PASSWORD: '1234',
    OFFICE_ASSETS_AUTH_SECRET: 'test-secret',
    OFFICE_GEMINI_ENCRYPTION_SECRET: 'gemini-test-secret',
  };
}

async function dispatch(request: Request, env: Env): Promise<Response> {
  return worker.fetch(request, env, new FakeExecutionContext());
}

function roomHeaders(cookie = ''): HeadersInit {
  const headers = new Headers({ 'x-office-room-id': 'room-42' });
  if (cookie) {
    headers.set('cookie', cookie);
  }
  return headers;
}

const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string'
      ? new URL(input)
      : input instanceof URL
        ? input
        : new URL(input.url);

    if (url.origin === 'https://office-static.example') {
      const assetPath = url.pathname.replace('/office-runtime/static/', '');
      return new Response(`default:${assetPath}`, {
        status: 200,
        headers: { 'content-type': assetPath.endsWith('.webp') ? 'image/webp' : 'application/octet-stream' },
      });
    }

    throw new Error(`Unhandled fetch URL in test: ${url.toString()}`);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('office assets worker', () => {
  test('authenticates and stores transform metadata', async () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(schema);
    const env = createEnv(sqlite);

    const authResponse = await dispatch(new Request('https://worker.example/assets/auth', {
      method: 'POST',
      headers: roomHeaders(),
      body: JSON.stringify({ password: '1234' }),
    }), env);
    expect(authResponse.status).toBe(200);

    const cookie = authResponse.headers.get('set-cookie') || '';
    expect(cookie).toContain('office_assets_auth=');

    const statusResponse = await dispatch(new Request('https://worker.example/assets/auth/status', {
      headers: roomHeaders(cookie),
    }), env);
    expect(await statusResponse.json()).toMatchObject({ ok: true, authed: true });

    const writeResponse = await dispatch(new Request('https://worker.example/assets/positions', {
      method: 'POST',
      headers: new Headers({
        ...Object.fromEntries(new Headers(roomHeaders(cookie)).entries()),
        'content-type': 'application/json',
      }),
      body: JSON.stringify({ key: 'office_bg_small.webp', x: 12, y: 34, scale: 1.5 }),
    }), env);
    expect(writeResponse.status).toBe(200);

    const readResponse = await dispatch(new Request('https://worker.example/assets/positions', {
      headers: roomHeaders(cookie),
    }), env);
    const readPayload = await readResponse.json() as { items: Record<string, { x: number; y: number; scale: number }> };
    expect(readPayload.items['office_bg_small.webp']).toMatchObject({ x: 12, y: 34, scale: 1.5 });

    const geminiSave = await dispatch(new Request('https://worker.example/config/gemini', {
      method: 'POST',
      headers: new Headers({
        ...Object.fromEntries(new Headers(roomHeaders(cookie)).entries()),
        'content-type': 'application/json',
      }),
      body: JSON.stringify({ api_key: 'test-gemini-key-123456', model: 'nanobanana-pro' }),
    }), env);
    expect(geminiSave.status).toBe(200);
    expect(await geminiSave.json()).toMatchObject({
      ok: true,
      api_key_masked: 'test***3456',
      gemini_model: 'nanobanana-pro',
    });

    const geminiRead = await dispatch(new Request('https://worker.example/config/gemini', {
      headers: roomHeaders(cookie),
    }), env);
    expect(await geminiRead.json()).toMatchObject({
      ok: true,
      has_api_key: true,
      gemini_model: 'nanobanana-pro',
    });
  });

  test('uploads, restores, and serves current room assets from R2', async () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(schema);
    const env = createEnv(sqlite);

    const authResponse = await dispatch(new Request('https://worker.example/assets/auth', {
      method: 'POST',
      headers: roomHeaders(),
      body: JSON.stringify({ password: '1234' }),
    }), env);
    const cookie = authResponse.headers.get('set-cookie') || '';

    const beforeUpload = await dispatch(new Request('https://worker.example/office-runtime/static/office_bg_small.webp', {
      headers: roomHeaders(cookie),
    }), env);
    expect(await beforeUpload.text()).toBe('default:office_bg_small.webp');

    const uploadForm = new FormData();
    uploadForm.set('path', 'office_bg_small.webp');
    uploadForm.set('file', new File(['uploaded-room'], 'office_bg_small.webp', { type: 'image/webp' }));

    const uploadResponse = await dispatch(new Request('https://worker.example/assets/upload', {
      method: 'POST',
      headers: roomHeaders(cookie),
      body: uploadForm,
    }), env);
    expect(uploadResponse.status).toBe(200);

    const afterUpload = await dispatch(new Request('https://worker.example/office-runtime/static/office_bg_small.webp', {
      headers: roomHeaders(cookie),
    }), env);
    expect(await afterUpload.text()).toBe('uploaded-room');

    const restoreDefault = await dispatch(new Request('https://worker.example/assets/restore-default', {
      method: 'POST',
      headers: new Headers({
        ...Object.fromEntries(new Headers(roomHeaders(cookie)).entries()),
        'content-type': 'application/json',
      }),
      body: JSON.stringify({ path: 'office_bg_small.webp' }),
    }), env);
    expect(restoreDefault.status).toBe(200);

    const afterRestore = await dispatch(new Request('https://worker.example/office-runtime/static/office_bg_small.webp', {
      headers: roomHeaders(cookie),
    }), env);
    expect(await afterRestore.text()).toBe('default:office_bg_small.webp');
  });

  test('stores and re-applies favorite room backgrounds', async () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(schema);
    const env = createEnv(sqlite);

    const authResponse = await dispatch(new Request('https://worker.example/assets/auth', {
      method: 'POST',
      headers: roomHeaders(),
      body: JSON.stringify({ password: '1234' }),
    }), env);
    const cookie = authResponse.headers.get('set-cookie') || '';

    const initialUploadForm = new FormData();
    initialUploadForm.set('path', 'office_bg_small.webp');
    initialUploadForm.set('file', new File(['favorite-source'], 'office_bg_small.webp', { type: 'image/webp' }));

    await dispatch(new Request('https://worker.example/assets/upload', {
      method: 'POST',
      headers: roomHeaders(cookie),
      body: initialUploadForm,
    }), env);

    const saveFavorite = await dispatch(new Request('https://worker.example/assets/home-favorites/save-current', {
      method: 'POST',
      headers: roomHeaders(cookie),
    }), env);
    expect(saveFavorite.status).toBe(200);
    const saved = await saveFavorite.json() as { id: string };
    expect(saved.id).toContain('home-');

    const secondUploadForm = new FormData();
    secondUploadForm.set('path', 'office_bg_small.webp');
    secondUploadForm.set('file', new File(['different-room'], 'office_bg_small.webp', { type: 'image/webp' }));

    await dispatch(new Request('https://worker.example/assets/upload', {
      method: 'POST',
      headers: roomHeaders(cookie),
      body: secondUploadForm,
    }), env);

    const applyFavorite = await dispatch(new Request('https://worker.example/assets/home-favorites/apply', {
      method: 'POST',
      headers: new Headers({
        ...Object.fromEntries(new Headers(roomHeaders(cookie)).entries()),
        'content-type': 'application/json',
      }),
      body: JSON.stringify({ id: saved.id }),
    }), env);
    expect(applyFavorite.status).toBe(200);

    const afterApply = await dispatch(new Request('https://worker.example/office-runtime/static/office_bg_small.webp', {
      headers: roomHeaders(cookie),
    }), env);
    expect(await afterApply.text()).toBe('favorite-source');

    const listFavorites = await dispatch(new Request('https://worker.example/assets/home-favorites/list', {
      headers: roomHeaders(cookie),
    }), env);
    const favoritesPayload = await listFavorites.json() as { items: Array<{ id: string; thumb_url: string }> };
    expect(favoritesPayload.items).toHaveLength(1);
    expect(favoritesPayload.items[0]?.thumb_url).toContain('/assets/home-favorites/preview?id=');

    const preview = await dispatch(new Request(`https://worker.example${favoritesPayload.items[0]?.thumb_url}`, {
      headers: roomHeaders(cookie),
    }), env);
    expect(await preview.text()).toBe('favorite-source');

    const deleteFavorite = await dispatch(new Request('https://worker.example/assets/home-favorites/delete', {
      method: 'POST',
      headers: new Headers({
        ...Object.fromEntries(new Headers(roomHeaders(cookie)).entries()),
        'content-type': 'application/json',
      }),
      body: JSON.stringify({ id: saved.id }),
    }), env);
    expect(deleteFavorite.status).toBe(200);

    const afterDelete = await dispatch(new Request('https://worker.example/assets/home-favorites/list', {
      headers: roomHeaders(cookie),
    }), env);
    expect(await afterDelete.json()).toMatchObject({ ok: true, items: [] });
  });
});
