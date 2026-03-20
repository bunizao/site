interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface R2ObjectBody {
  body: ReadableStream<Uint8Array> | null;
  httpEtag?: string;
  size?: number;
  writeHttpMetadata(headers: Headers): void;
}

interface R2Bucket {
  put(
    key: string,
    value: ReadableStream<Uint8Array> | ArrayBuffer | ArrayBufferView | Blob | string,
    options?: {
      httpMetadata?: {
        contentType?: string;
        cacheControl?: string;
      };
      customMetadata?: Record<string, string>;
    }
  ): Promise<void>;
  get(key: string): Promise<R2ObjectBody | null>;
  delete(key: string): Promise<void>;
}

interface D1StatementResult<T = Record<string, unknown>> {
  results?: T[];
  success: boolean;
  meta?: Record<string, unknown>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<D1StatementResult<T>>;
  all<T = Record<string, unknown>>(): Promise<D1StatementResult<T>>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

export interface Env {
  OFFICE_ASSETS_BUCKET: R2Bucket;
  OFFICE_ASSETS_DB: D1Database;
  OFFICE_DEFAULT_ROOM_ID?: string;
  OFFICE_RUNTIME_STATIC_BASE_URL?: string;
  OFFICE_ASSETS_AUTH_PASSWORD?: string;
  OFFICE_ASSETS_AUTH_SECRET?: string;
  OFFICE_GEMINI_ENCRYPTION_SECRET?: string;
}

interface AssetItem {
  path: string;
  width: number;
  height: number;
  ext: string;
  size: number;
  mtime: string;
}

interface AssetStateRow {
  current_version_id: string | null;
  default_version_id: string | null;
  previous_version_id: string | null;
  updated_at: string;
}

interface AssetVersionRow {
  version_id: string;
  r2_key: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
}

interface TransformRow {
  asset_key: string;
  x: number;
  y: number;
  scale: number;
  updated_at: string;
}

interface FavoriteRow {
  favorite_id: string;
  asset_path: string;
  r2_key: string;
  content_type: string;
  created_at: string;
}

interface GeminiConfigRow {
  cipher_text: string;
  iv_b64: string;
  model: string;
  updated_at: string;
}

interface StoredBinary {
  bytes: ArrayBuffer;
  contentType: string;
  cacheControl?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-office-room-id',
};

const AUTH_COOKIE_NAME = 'office_assets_auth';
const AUTH_MAX_AGE_SECONDS = 60 * 60 * 12;
const CACHE_CONTROL_DYNAMIC = 'no-store';
const CACHE_CONTROL_STATIC = 'public, max-age=60';
const MAX_FAVORITES = 30;
const DEFAULT_ROOM_BACKGROUND_PATH = 'office_bg_small.webp';

const STATIC_ASSET_SOURCE: Array<[string, number, number]> = [
  ['btn-back-home-sprite.png', 480, 160],
  ['btn-broker-sprite.png', 480, 160],
  ['btn-diy-sprite.png', 480, 160],
  ['btn-move-house-sprite.png', 480, 160],
  ['btn-open-drawer-sprite.png', 720, 160],
  ['btn-state-sprite.png', 480, 160],
  ['cats-spritesheet.webp', 1600, 160],
  ['coffee-machine-shadow-v1.png', 230, 230],
  ['coffee-machine-v3-grid.webp', 2760, 1840],
  ['desk-v3.webp', 276, 214],
  ['error-bug-spritesheet-grid.webp', 1760, 1980],
  ['flowers-bloom-v2.webp', 1040, 1040],
  ['guest_anim_1.webp', 128, 64],
  ['guest_anim_2.webp', 128, 64],
  ['guest_anim_3.webp', 128, 64],
  ['guest_anim_4.webp', 128, 64],
  ['guest_anim_5.webp', 128, 64],
  ['guest_anim_6.webp', 128, 64],
  ['guest_role_1.png', 32, 32],
  ['guest_role_2.png', 32, 32],
  ['guest_role_3.png', 32, 32],
  ['guest_role_4.png', 32, 32],
  ['guest_role_5.png', 32, 32],
  ['guest_role_6.png', 32, 32],
  ['memo-bg.webp', 400, 300],
  ['office_bg.webp', 1280, 720],
  ['office_bg_small.webp', 1280, 720],
  ['plants-spritesheet.webp', 480, 160],
  ['posters-spritesheet.webp', 5120, 160],
  ['serverroom-spritesheet.webp', 7200, 251],
  ['sofa-idle-v3.png', 256, 256],
  ['sofa-shadow-v1.png', 256, 256],
  ['star-idle-v5.png', 2048, 1536],
  ['star-working-spritesheet-grid.webp', 2400, 1500],
  ['sync-animation-v3-grid.webp', 2048, 1792],
];

const STATIC_ASSET_ITEMS: AssetItem[] = STATIC_ASSET_SOURCE.map(([assetPath, width, height]) => ({
  path: assetPath,
  width,
  height,
  ext: `.${String(assetPath).split('.').pop()}`,
  size: 0,
  mtime: '',
}));

function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('content-type', 'application/json; charset=utf-8');
  responseHeaders.set('cache-control', CACHE_CONTROL_DYNAMIC);
  applyCorsHeaders(responseHeaders);
  return new Response(JSON.stringify(data), { status, headers: responseHeaders });
}

function applyCorsHeaders(headers: Headers): void {
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
}

function unsupportedResponse(): Response {
  return json({ ok: false, unsupported: true, msg: 'Unsupported in Worker-backed office runtime.' });
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function readRoomId(url: URL, request: Request, env: Env): string {
  const headerRoomId = request.headers.get('x-office-room-id')?.trim();
  if (headerRoomId) return headerRoomId;

  const queryRoomId = url.searchParams.get('room')?.trim();
  if (queryRoomId) return queryRoomId;

  return env.OFFICE_DEFAULT_ROOM_ID?.trim() || 'demo';
}

function sanitizeAssetPath(value: string): string {
  const normalized = value.trim().replace(/^\/+/, '');
  if (!normalized || normalized.includes('..') || normalized.startsWith('.')) {
    return '';
  }
  return normalized;
}

function isEditableAssetPath(assetPath: string): boolean {
  return STATIC_ASSET_ITEMS.some((item) => item.path === assetPath);
}

function contentTypeForPath(assetPath: string): string {
  const lower = assetPath.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.woff2')) return 'font/woff2';
  if (lower.endsWith('.js')) return 'text/javascript; charset=utf-8';
  return 'application/octet-stream';
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }
  return btoa(binary);
}

function encodeBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return atob(padded);
}

function readCookie(request: Request, name: string): string {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const parts = cookieHeader.split(/;\s*/);
  for (const part of parts) {
    const [cookieName, ...rest] = part.split('=');
    if (cookieName === name) {
      return rest.join('=');
    }
  }
  return '';
}

function makeVersionId(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomUUID()}`;
}

function hashAssetPath(assetPath: string): string {
  return assetPath.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function buildAssetR2Key(roomId: string, assetPath: string, versionId: string): string {
  return `office-assets/${roomId}/${hashAssetPath(assetPath)}/${versionId}`;
}

function buildFavoriteR2Key(roomId: string, favoriteId: string, assetPath: string): string {
  const ext = assetPath.split('.').pop() || 'bin';
  return `office-favorites/${roomId}/${favoriteId}.${ext}`;
}

function maskKey(value: string): string {
  if (!value) return '';
  if (value.length <= 8) return `${value.slice(0, 2)}***`;
  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function signValue(secret: string, value: string): Promise<string> {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return encodeBase64(new Uint8Array(signature)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function getAuthSecret(env: Env): string {
  return env.OFFICE_ASSETS_AUTH_SECRET?.trim()
    || env.OFFICE_GEMINI_ENCRYPTION_SECRET?.trim()
    || env.OFFICE_ASSETS_AUTH_PASSWORD?.trim()
    || '1234';
}

async function createAuthToken(roomId: string, env: Env): Promise<string> {
  const expiresAt = Date.now() + (AUTH_MAX_AGE_SECONDS * 1000);
  const payload = `${roomId}|${expiresAt}`;
  const encodedPayload = encodeBase64Url(payload);
  const signature = await signValue(getAuthSecret(env), encodedPayload);
  return `${encodedPayload}.${signature}`;
}

async function isAuthorized(request: Request, roomId: string, env: Env): Promise<boolean> {
  const token = readCookie(request, AUTH_COOKIE_NAME);
  if (!token) return false;

  const [encodedPayload, providedSignature] = token.split('.');
  if (!encodedPayload || !providedSignature) {
    return false;
  }

  const expectedSignature = await signValue(getAuthSecret(env), encodedPayload);
  if (expectedSignature !== providedSignature) {
    return false;
  }

  const payload = decodeBase64Url(encodedPayload);
  const [tokenRoomId, expiresAtRaw] = payload.split('|');
  const expiresAt = Number.parseInt(expiresAtRaw || '', 10);
  if (!tokenRoomId || tokenRoomId !== roomId) {
    return false;
  }
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return false;
  }

  return true;
}

function authRequired(): Response {
  return json({ ok: false, code: 'UNAUTHORIZED', msg: 'Asset editor auth required' }, 401);
}

function makeAuthCookie(token: string, requestUrl: URL): string {
  const parts = [
    `${AUTH_COOKIE_NAME}=${token}`,
    'Path=/',
    `Max-Age=${AUTH_MAX_AGE_SECONDS}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (requestUrl.protocol === 'https:') {
    parts.push('Secure');
  }
  return parts.join('; ');
}

function clearAuthCookie(requestUrl: URL): string {
  const parts = [
    `${AUTH_COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (requestUrl.protocol === 'https:') {
    parts.push('Secure');
  }
  return parts.join('; ');
}

async function importGeminiKey(env: Env): Promise<CryptoKey> {
  const secret = env.OFFICE_GEMINI_ENCRYPTION_SECRET?.trim()
    || env.OFFICE_ASSETS_AUTH_SECRET?.trim()
    || env.OFFICE_ASSETS_AUTH_PASSWORD?.trim()
    || '1234';
  const material = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptGeminiKey(plainText: string, env: Env): Promise<{ cipherText: string; ivB64: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importGeminiKey(env);
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plainText),
  );
  return {
    cipherText: encodeBase64(new Uint8Array(cipherBuffer)),
    ivB64: encodeBase64(iv),
  };
}

async function fetchUpstreamStaticAsset(env: Env, assetPath: string): Promise<StoredBinary | null> {
  const baseUrl = trimTrailingSlash(env.OFFICE_RUNTIME_STATIC_BASE_URL?.trim() || '');
  if (!baseUrl) {
    return null;
  }

  const response = await fetch(`${baseUrl}/${assetPath}`, {
    headers: { 'cache-control': 'no-store' },
  });
  if (!response.ok) {
    return null;
  }

  return {
    bytes: await response.arrayBuffer(),
    contentType: response.headers.get('content-type') || contentTypeForPath(assetPath),
    cacheControl: response.headers.get('cache-control') || CACHE_CONTROL_STATIC,
  };
}

async function getAssetState(db: D1Database, roomId: string, assetPath: string): Promise<AssetStateRow | null> {
  return db.prepare(
    'SELECT current_version_id, default_version_id, previous_version_id, updated_at FROM office_asset_state WHERE room_id = ?1 AND asset_path = ?2',
  ).bind(roomId, assetPath).first<AssetStateRow>();
}

async function getAssetVersion(
  db: D1Database,
  roomId: string,
  assetPath: string,
  versionId: string | null | undefined,
): Promise<AssetVersionRow | null> {
  if (!versionId) return null;
  return db.prepare(
    'SELECT version_id, r2_key, content_type, size_bytes, created_at FROM office_asset_versions WHERE room_id = ?1 AND asset_path = ?2 AND version_id = ?3',
  ).bind(roomId, assetPath, versionId).first<AssetVersionRow>();
}

async function putBinaryToR2(
  env: Env,
  key: string,
  bytes: ArrayBuffer,
  contentType: string,
  cacheControl = CACHE_CONTROL_STATIC,
): Promise<void> {
  await env.OFFICE_ASSETS_BUCKET.put(key, bytes, {
    httpMetadata: {
      contentType,
      cacheControl,
    },
  });
}

async function readBinaryFromR2(env: Env, key: string): Promise<StoredBinary | null> {
  const object = await env.OFFICE_ASSETS_BUCKET.get(key);
  if (!object?.body) {
    return null;
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);

  return {
    bytes: await new Response(object.body).arrayBuffer(),
    contentType: headers.get('content-type') || 'application/octet-stream',
    cacheControl: headers.get('cache-control') || CACHE_CONTROL_STATIC,
  };
}

async function createAssetVersion(
  env: Env,
  db: D1Database,
  roomId: string,
  assetPath: string,
  prefix: string,
  binary: StoredBinary,
): Promise<string> {
  const versionId = makeVersionId(prefix);
  const r2Key = buildAssetR2Key(roomId, assetPath, versionId);
  await putBinaryToR2(env, r2Key, binary.bytes, binary.contentType);
  await db.prepare(
    'INSERT INTO office_asset_versions (room_id, asset_path, version_id, r2_key, content_type, size_bytes, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)',
  ).bind(
    roomId,
    assetPath,
    versionId,
    r2Key,
    binary.contentType,
    binary.bytes.byteLength,
    new Date().toISOString(),
  ).run();
  return versionId;
}

async function upsertAssetState(
  db: D1Database,
  roomId: string,
  assetPath: string,
  state: {
    currentVersionId: string | null;
    defaultVersionId: string | null;
    previousVersionId: string | null;
  },
): Promise<void> {
  await db.prepare(
    `INSERT INTO office_asset_state (room_id, asset_path, current_version_id, default_version_id, previous_version_id, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(room_id, asset_path) DO UPDATE SET
       current_version_id = excluded.current_version_id,
       default_version_id = excluded.default_version_id,
       previous_version_id = excluded.previous_version_id,
       updated_at = excluded.updated_at`,
  ).bind(
    roomId,
    assetPath,
    state.currentVersionId,
    state.defaultVersionId,
    state.previousVersionId,
    new Date().toISOString(),
  ).run();
}

async function ensureDefaultVersion(
  env: Env,
  db: D1Database,
  roomId: string,
  assetPath: string,
  existingState: AssetStateRow | null,
): Promise<{ state: AssetStateRow | null; defaultVersionId: string | null }> {
  if (existingState?.default_version_id) {
    return { state: existingState, defaultVersionId: existingState.default_version_id };
  }

  const defaultBinary = await fetchUpstreamStaticAsset(env, assetPath);
  if (!defaultBinary) {
    return { state: existingState, defaultVersionId: null };
  }

  const defaultVersionId = await createAssetVersion(env, db, roomId, assetPath, 'default', defaultBinary);
  const nextState = {
    currentVersionId: existingState?.current_version_id ?? null,
    defaultVersionId,
    previousVersionId: existingState?.previous_version_id ?? null,
  };
  await upsertAssetState(db, roomId, assetPath, nextState);
  return {
    state: {
      current_version_id: nextState.currentVersionId,
      default_version_id: nextState.defaultVersionId,
      previous_version_id: nextState.previousVersionId,
      updated_at: new Date().toISOString(),
    },
    defaultVersionId,
  };
}

async function readAssetBinaryByVersion(
  env: Env,
  db: D1Database,
  roomId: string,
  assetPath: string,
  versionId: string | null | undefined,
): Promise<StoredBinary | null> {
  const version = await getAssetVersion(db, roomId, assetPath, versionId);
  if (!version) return null;
  return readBinaryFromR2(env, version.r2_key);
}

async function readCurrentAssetBinary(
  env: Env,
  db: D1Database,
  roomId: string,
  assetPath: string,
): Promise<StoredBinary | null> {
  if (!isEditableAssetPath(assetPath)) {
    return fetchUpstreamStaticAsset(env, assetPath);
  }

  const state = await getAssetState(db, roomId, assetPath);
  const currentBinary = await readAssetBinaryByVersion(env, db, roomId, assetPath, state?.current_version_id);
  if (currentBinary) return currentBinary;

  const ensured = await ensureDefaultVersion(env, db, roomId, assetPath, state);
  const defaultBinary = await readAssetBinaryByVersion(env, db, roomId, assetPath, ensured.defaultVersionId);
  if (defaultBinary) return defaultBinary;

  return fetchUpstreamStaticAsset(env, assetPath);
}

async function listTransforms(
  db: D1Database,
  table: 'office_asset_positions' | 'office_asset_defaults',
  roomId: string,
): Promise<Record<string, { x: number; y: number; scale: number; updated_at: string }>> {
  const result = await db.prepare(
    `SELECT asset_key, x, y, scale, updated_at FROM ${table} WHERE room_id = ?1`,
  ).bind(roomId).all<TransformRow>();

  const items: Record<string, { x: number; y: number; scale: number; updated_at: string }> = {};
  for (const row of result.results || []) {
    items[row.asset_key] = {
      x: Number(row.x),
      y: Number(row.y),
      scale: Number(row.scale),
      updated_at: row.updated_at,
    };
  }
  return items;
}

async function upsertTransform(
  db: D1Database,
  table: 'office_asset_positions' | 'office_asset_defaults',
  roomId: string,
  key: string,
  x: number,
  y: number,
  scale: number,
): Promise<{ x: number; y: number; scale: number; updated_at: string }> {
  const updatedAt = new Date().toISOString();
  await db.prepare(
    `INSERT INTO ${table} (room_id, asset_key, x, y, scale, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(room_id, asset_key) DO UPDATE SET
       x = excluded.x,
       y = excluded.y,
       scale = excluded.scale,
       updated_at = excluded.updated_at`,
  ).bind(roomId, key, x, y, scale, updatedAt).run();

  return { x, y, scale, updated_at: updatedAt };
}

async function listFavorites(db: D1Database, roomId: string): Promise<FavoriteRow[]> {
  const result = await db.prepare(
    'SELECT favorite_id, asset_path, r2_key, content_type, created_at FROM office_home_favorites WHERE room_id = ?1 ORDER BY created_at DESC',
  ).bind(roomId).all<FavoriteRow>();
  return result.results || [];
}

async function pruneFavorites(env: Env, db: D1Database, roomId: string): Promise<void> {
  const favorites = await listFavorites(db, roomId);
  const overflow = favorites.slice(MAX_FAVORITES);
  for (const favorite of overflow) {
    await env.OFFICE_ASSETS_BUCKET.delete(favorite.r2_key);
    await db.prepare(
      'DELETE FROM office_home_favorites WHERE room_id = ?1 AND favorite_id = ?2',
    ).bind(roomId, favorite.favorite_id).run();
  }
}

async function readGeminiConfig(db: D1Database, roomId: string): Promise<GeminiConfigRow | null> {
  return db.prepare(
    'SELECT cipher_text, iv_b64, model, updated_at FROM office_gemini_config WHERE room_id = ?1',
  ).bind(roomId).first<GeminiConfigRow>();
}

function buildFavoritePreviewUrl(favoriteId: string): string {
  const search = new URLSearchParams({ id: favoriteId });
  return `/assets/home-favorites/preview?${search.toString()}`;
}

async function handleAuth(url: URL, request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ ok: false, msg: 'Method Not Allowed' }, 405);
  }

  const roomId = readRoomId(url, request, env);
  const payload = await request.json().catch(() => ({}));
  const password = String((payload as Record<string, unknown>)?.password || '').trim();
  const expectedPassword = env.OFFICE_ASSETS_AUTH_PASSWORD?.trim() || '1234';

  if (password !== expectedPassword) {
    const response = json({ ok: false, msg: '验证码错误' }, 401);
    response.headers.set('set-cookie', clearAuthCookie(url));
    return response;
  }

  const token = await createAuthToken(roomId, env);
  const response = json({ ok: true, msg: '认证成功' });
  response.headers.set('set-cookie', makeAuthCookie(token, url));
  return response;
}

async function handleAuthStatus(url: URL, request: Request, env: Env): Promise<Response> {
  const roomId = readRoomId(url, request, env);
  const authed = await isAuthorized(request, roomId, env);
  return json({ ok: true, authed, drawer_default_pass: true });
}

async function handleListAssets(): Promise<Response> {
  return json({ ok: true, count: STATIC_ASSET_ITEMS.length, items: STATIC_ASSET_ITEMS });
}

async function handleTransforms(
  url: URL,
  request: Request,
  env: Env,
  table: 'office_asset_positions' | 'office_asset_defaults',
): Promise<Response> {
  const roomId = readRoomId(url, request, env);
  if (!(await isAuthorized(request, roomId, env))) {
    return authRequired();
  }

  if (request.method === 'GET') {
    return json({ ok: true, items: await listTransforms(env.OFFICE_ASSETS_DB, table, roomId) });
  }

  if (request.method !== 'POST') {
    return json({ ok: false, msg: 'Method Not Allowed' }, 405);
  }

  const payload = await request.json().catch(() => ({}));
  const key = String((payload as Record<string, unknown>)?.key || '').trim();
  if (!key) {
    return json({ ok: false, msg: '缺少 key' }, 400);
  }

  const x = Number((payload as Record<string, unknown>)?.x || 0);
  const y = Number((payload as Record<string, unknown>)?.y || 0);
  const scale = Number((payload as Record<string, unknown>)?.scale || 1);
  const entry = await upsertTransform(env.OFFICE_ASSETS_DB, table, roomId, key, x, y, scale);

  return json({ ok: true, key, ...entry });
}

async function handleUpload(url: URL, request: Request, env: Env): Promise<Response> {
  const roomId = readRoomId(url, request, env);
  if (!(await isAuthorized(request, roomId, env))) {
    return authRequired();
  }

  const form = await request.formData();
  const assetPath = sanitizeAssetPath(String(form.get('path') || ''));
  const file = form.get('file');
  if (!assetPath || !(file instanceof File)) {
    return json({ ok: false, msg: '缺少 path 或 file' }, 400);
  }
  if (!isEditableAssetPath(assetPath)) {
    return json({ ok: false, msg: 'Asset path is not editable' }, 400);
  }

  const existingState = await getAssetState(env.OFFICE_ASSETS_DB, roomId, assetPath);
  const { defaultVersionId } = await ensureDefaultVersion(env, env.OFFICE_ASSETS_DB, roomId, assetPath, existingState);

  const contentType = file.type || contentTypeForPath(assetPath);
  const uploadBinary: StoredBinary = {
    bytes: await file.arrayBuffer(),
    contentType,
  };
  const currentVersionId = await createAssetVersion(env, env.OFFICE_ASSETS_DB, roomId, assetPath, 'current', uploadBinary);

  await upsertAssetState(env.OFFICE_ASSETS_DB, roomId, assetPath, {
    currentVersionId,
    defaultVersionId,
    previousVersionId: existingState?.current_version_id ?? null,
  });

  return json({ ok: true, path: assetPath, msg: '已上传' });
}

async function handleRestoreDefault(url: URL, request: Request, env: Env): Promise<Response> {
  const roomId = readRoomId(url, request, env);
  if (!(await isAuthorized(request, roomId, env))) {
    return authRequired();
  }
  if (request.method !== 'POST') {
    return json({ ok: false, msg: 'Method Not Allowed' }, 405);
  }

  const payload = await request.json().catch(() => ({}));
  const assetPath = sanitizeAssetPath(String((payload as Record<string, unknown>)?.path || ''));
  const state = await getAssetState(env.OFFICE_ASSETS_DB, roomId, assetPath);
  if (!assetPath || !state?.default_version_id) {
    return json({ ok: false, msg: '未找到默认资产快照' }, 404);
  }

  await upsertAssetState(env.OFFICE_ASSETS_DB, roomId, assetPath, {
    currentVersionId: state.default_version_id,
    defaultVersionId: state.default_version_id,
    previousVersionId: state.current_version_id,
  });

  return json({ ok: true, path: assetPath, msg: '已重置为默认资产' });
}

async function handleRestorePrevious(url: URL, request: Request, env: Env): Promise<Response> {
  const roomId = readRoomId(url, request, env);
  if (!(await isAuthorized(request, roomId, env))) {
    return authRequired();
  }
  if (request.method !== 'POST') {
    return json({ ok: false, msg: 'Method Not Allowed' }, 405);
  }

  const payload = await request.json().catch(() => ({}));
  const assetPath = sanitizeAssetPath(String((payload as Record<string, unknown>)?.path || ''));
  const state = await getAssetState(env.OFFICE_ASSETS_DB, roomId, assetPath);
  if (!assetPath || !state?.previous_version_id) {
    return json({ ok: false, msg: '未找到上一版备份' }, 404);
  }

  await upsertAssetState(env.OFFICE_ASSETS_DB, roomId, assetPath, {
    currentVersionId: state.previous_version_id,
    defaultVersionId: state.default_version_id,
    previousVersionId: state.current_version_id,
  });

  return json({ ok: true, path: assetPath, msg: '已回退到上一版' });
}

async function handleGeminiConfig(url: URL, request: Request, env: Env): Promise<Response> {
  const roomId = readRoomId(url, request, env);
  if (!(await isAuthorized(request, roomId, env))) {
    return authRequired();
  }

  if (request.method === 'GET') {
    const config = await readGeminiConfig(env.OFFICE_ASSETS_DB, roomId);
    return json({
      ok: true,
      has_api_key: !!config?.cipher_text,
      api_key_masked: config?.cipher_text ? '****' : '',
      gemini_model: config?.model || 'nanobanana-pro',
    });
  }

  if (request.method !== 'POST') {
    return json({ ok: false, msg: 'Method Not Allowed' }, 405);
  }

  const payload = await request.json().catch(() => ({}));
  const apiKey = String((payload as Record<string, unknown>)?.api_key || '').trim();
  const model = String((payload as Record<string, unknown>)?.model || 'nanobanana-pro').trim() || 'nanobanana-pro';
  const updatedAt = new Date().toISOString();

  if (!apiKey) {
    await env.OFFICE_ASSETS_DB.prepare('DELETE FROM office_gemini_config WHERE room_id = ?1').bind(roomId).run();
    return json({ ok: true, api_key_masked: '', gemini_model: model });
  }

  const encrypted = await encryptGeminiKey(apiKey, env);
  await env.OFFICE_ASSETS_DB.prepare(
    `INSERT INTO office_gemini_config (room_id, cipher_text, iv_b64, model, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(room_id) DO UPDATE SET
       cipher_text = excluded.cipher_text,
       iv_b64 = excluded.iv_b64,
       model = excluded.model,
       updated_at = excluded.updated_at`,
  ).bind(roomId, encrypted.cipherText, encrypted.ivB64, model, updatedAt).run();

  return json({ ok: true, api_key_masked: maskKey(apiKey), gemini_model: model });
}

async function handleFavoritesList(url: URL, request: Request, env: Env): Promise<Response> {
  const roomId = readRoomId(url, request, env);
  if (!(await isAuthorized(request, roomId, env))) {
    return authRequired();
  }

  const items = (await listFavorites(env.OFFICE_ASSETS_DB, roomId)).slice(0, MAX_FAVORITES).map((favorite) => ({
    id: favorite.favorite_id,
    path: favorite.asset_path,
    url: buildFavoritePreviewUrl(favorite.favorite_id),
    thumb_url: buildFavoritePreviewUrl(favorite.favorite_id),
    created_at: favorite.created_at,
  }));

  return json({ ok: true, items });
}

async function handleFavoritePreview(url: URL, request: Request, env: Env): Promise<Response> {
  const roomId = readRoomId(url, request, env);
  if (!(await isAuthorized(request, roomId, env))) {
    return authRequired();
  }

  const favoriteId = String(url.searchParams.get('id') || '').trim();
  if (!favoriteId) {
    return new Response('Not Found', { status: 404 });
  }

  const favorite = await env.OFFICE_ASSETS_DB.prepare(
    'SELECT favorite_id, asset_path, r2_key, content_type, created_at FROM office_home_favorites WHERE room_id = ?1 AND favorite_id = ?2',
  ).bind(roomId, favoriteId).first<FavoriteRow>();
  if (!favorite) {
    return new Response('Not Found', { status: 404 });
  }

  const binary = await readBinaryFromR2(env, favorite.r2_key);
  if (!binary) {
    return new Response('Not Found', { status: 404 });
  }

  const headers = new Headers({
    'content-type': binary.contentType,
    'cache-control': CACHE_CONTROL_DYNAMIC,
  });
  applyCorsHeaders(headers);
  return new Response(binary.bytes, { status: 200, headers });
}

async function handleFavoriteSave(url: URL, request: Request, env: Env): Promise<Response> {
  const roomId = readRoomId(url, request, env);
  if (!(await isAuthorized(request, roomId, env))) {
    return authRequired();
  }

  const currentBinary = await readCurrentAssetBinary(env, env.OFFICE_ASSETS_DB, roomId, DEFAULT_ROOM_BACKGROUND_PATH);
  if (!currentBinary) {
    return json({ ok: false, msg: '未找到当前地图资产' }, 404);
  }

  const favoriteId = `home-${Date.now()}-${crypto.randomUUID()}`;
  const r2Key = buildFavoriteR2Key(roomId, favoriteId, DEFAULT_ROOM_BACKGROUND_PATH);
  await putBinaryToR2(env, r2Key, currentBinary.bytes, currentBinary.contentType);

  const createdAt = new Date().toISOString();
  await env.OFFICE_ASSETS_DB.prepare(
    'INSERT INTO office_home_favorites (room_id, favorite_id, asset_path, r2_key, content_type, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
  ).bind(roomId, favoriteId, DEFAULT_ROOM_BACKGROUND_PATH, r2Key, currentBinary.contentType, createdAt).run();
  await pruneFavorites(env, env.OFFICE_ASSETS_DB, roomId);

  return json({ ok: true, id: favoriteId, path: DEFAULT_ROOM_BACKGROUND_PATH, msg: '已收藏当前地图' });
}

async function handleFavoriteApply(url: URL, request: Request, env: Env): Promise<Response> {
  const roomId = readRoomId(url, request, env);
  if (!(await isAuthorized(request, roomId, env))) {
    return authRequired();
  }
  if (request.method !== 'POST') {
    return json({ ok: false, msg: 'Method Not Allowed' }, 405);
  }

  const payload = await request.json().catch(() => ({}));
  const favoriteId = String((payload as Record<string, unknown>)?.id || '').trim();
  const favorite = await env.OFFICE_ASSETS_DB.prepare(
    'SELECT favorite_id, asset_path, r2_key, content_type, created_at FROM office_home_favorites WHERE room_id = ?1 AND favorite_id = ?2',
  ).bind(roomId, favoriteId).first<FavoriteRow>();
  if (!favorite) {
    return json({ ok: false, msg: '收藏项不存在' }, 404);
  }

  const favoriteBinary = await readBinaryFromR2(env, favorite.r2_key);
  if (!favoriteBinary) {
    return json({ ok: false, msg: '收藏项不存在' }, 404);
  }

  const existingState = await getAssetState(env.OFFICE_ASSETS_DB, roomId, DEFAULT_ROOM_BACKGROUND_PATH);
  const { defaultVersionId } = await ensureDefaultVersion(env, env.OFFICE_ASSETS_DB, roomId, DEFAULT_ROOM_BACKGROUND_PATH, existingState);
  const currentVersionId = await createAssetVersion(
    env,
    env.OFFICE_ASSETS_DB,
    roomId,
    DEFAULT_ROOM_BACKGROUND_PATH,
    'favorite',
    favoriteBinary,
  );

  await upsertAssetState(env.OFFICE_ASSETS_DB, roomId, DEFAULT_ROOM_BACKGROUND_PATH, {
    currentVersionId,
    defaultVersionId,
    previousVersionId: existingState?.current_version_id ?? null,
  });

  return json({ ok: true, path: DEFAULT_ROOM_BACKGROUND_PATH, from: favorite.asset_path, msg: '已应用收藏地图' });
}

async function handleFavoriteDelete(url: URL, request: Request, env: Env): Promise<Response> {
  const roomId = readRoomId(url, request, env);
  if (!(await isAuthorized(request, roomId, env))) {
    return authRequired();
  }
  if (request.method !== 'POST') {
    return json({ ok: false, msg: 'Method Not Allowed' }, 405);
  }

  const payload = await request.json().catch(() => ({}));
  const favoriteId = String((payload as Record<string, unknown>)?.id || '').trim();
  const favorite = await env.OFFICE_ASSETS_DB.prepare(
    'SELECT favorite_id, asset_path, r2_key, content_type, created_at FROM office_home_favorites WHERE room_id = ?1 AND favorite_id = ?2',
  ).bind(roomId, favoriteId).first<FavoriteRow>();

  if (favorite) {
    await env.OFFICE_ASSETS_BUCKET.delete(favorite.r2_key);
    await env.OFFICE_ASSETS_DB.prepare(
      'DELETE FROM office_home_favorites WHERE room_id = ?1 AND favorite_id = ?2',
    ).bind(roomId, favoriteId).run();
  }

  return json({ ok: true, id: favoriteId, msg: '已删除收藏' });
}

async function handleStaticAsset(url: URL, request: Request, env: Env): Promise<Response> {
  const roomId = readRoomId(url, request, env);
  const rawPath = url.pathname.replace(/^\/office-runtime\/static\//, '');
  const assetPath = sanitizeAssetPath(rawPath);
  if (!assetPath) {
    return new Response('Not Found', { status: 404 });
  }

  const currentBinary = await readCurrentAssetBinary(env, env.OFFICE_ASSETS_DB, roomId, assetPath);
  if (!currentBinary) {
    return new Response('Not Found', { status: 404 });
  }

  const headers = new Headers({
    'content-type': currentBinary.contentType,
    'cache-control': currentBinary.cacheControl || CACHE_CONTROL_STATIC,
  });
  applyCorsHeaders(headers);
  return new Response(currentBinary.bytes, { status: 200, headers });
}

async function routeRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    const headers = new Headers();
    applyCorsHeaders(headers);
    return new Response(null, { status: 204, headers });
  }

  if (url.pathname === '/health') {
    return json({ ok: true, service: 'office-assets-worker' });
  }

  if (url.pathname === '/assets/auth/status') {
    return handleAuthStatus(url, request, env);
  }

  if (url.pathname === '/assets/auth') {
    return handleAuth(url, request, env);
  }

  if (url.pathname === '/assets/list') {
    return handleListAssets();
  }

  if (url.pathname === '/assets/positions') {
    return handleTransforms(url, request, env, 'office_asset_positions');
  }

  if (url.pathname === '/assets/defaults') {
    return handleTransforms(url, request, env, 'office_asset_defaults');
  }

  if (url.pathname === '/assets/upload') {
    return handleUpload(url, request, env);
  }

  if (url.pathname === '/assets/restore-default') {
    return handleRestoreDefault(url, request, env);
  }

  if (url.pathname === '/assets/restore-prev') {
    return handleRestorePrevious(url, request, env);
  }

  if (url.pathname === '/config/gemini') {
    return handleGeminiConfig(url, request, env);
  }

  if (url.pathname === '/assets/home-favorites/list') {
    return handleFavoritesList(url, request, env);
  }

  if (url.pathname === '/assets/home-favorites/preview') {
    return handleFavoritePreview(url, request, env);
  }

  if (url.pathname === '/assets/home-favorites/save-current') {
    return handleFavoriteSave(url, request, env);
  }

  if (url.pathname === '/assets/home-favorites/apply') {
    return handleFavoriteApply(url, request, env);
  }

  if (url.pathname === '/assets/home-favorites/delete') {
    return handleFavoriteDelete(url, request, env);
  }

  if (
    url.pathname === '/assets/generate-rpg-background'
    || url.pathname === '/assets/generate-rpg-background/poll'
    || url.pathname === '/assets/restore-reference-background'
    || url.pathname === '/assets/restore-last-generated-background'
  ) {
    return unsupportedResponse();
  }

  if (url.pathname.startsWith('/office-runtime/static/')) {
    return handleStaticAsset(url, request, env);
  }

  return new Response('Not Found', { status: 404 });
}

const worker = {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    try {
      return await routeRequest(request, env);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown office asset worker error';
      return json({ ok: false, msg: message }, 500);
    }
  },
};

export default worker;
