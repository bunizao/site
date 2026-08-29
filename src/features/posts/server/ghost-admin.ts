import { SignJWT } from 'jose';

import { readOptionalEnv, type RuntimeEnvLocals } from '@/lib/runtime/env';

const GHOST_ADMIN_API_VERSION = 'v6.0';
const GHOST_ADMIN_TOKEN_TTL_SECONDS = 5 * 60;
const DEFAULT_GHOST_ADMIN_TIMEOUT_MS = 8_000;
const MAX_GHOST_ADMIN_TIMEOUT_MS = 30_000;
const DEFAULT_GHOST_ADMIN_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_GHOST_ADMIN_MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const GHOST_POST_ID_PATTERN = /^[a-f0-9]{24}$/iu;
const GHOST_POST_UUID_PATTERN = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu;
const GHOST_ADMIN_KEY_PATTERN = /^([a-f0-9]{24}):([a-f0-9]{64})$/iu;

export type GhostAdminClientErrorCode =
  | 'invalid_configuration'
  | 'invalid_identifier'
  | 'invalid_response'
  | 'not_found'
  | 'request_failed'
  | 'timeout';

export class GhostAdminClientError extends Error {
  readonly code: GhostAdminClientErrorCode;
  readonly status?: number;

  constructor(code: GhostAdminClientErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'GhostAdminClientError';
    this.code = code;
    this.status = status;
  }
}

export interface GhostAdminPost {
  id: string;
  uuid: string;
  slug: string;
  title: string;
  html: string;
  status: string;
  updatedAt: string | null;
}

export interface GhostAdminPostSummary {
  id: string;
  uuid: string;
  slug: string;
  title: string;
  status: string;
  updatedAt: string | null;
  publishedAt: string | null;
}

export interface GhostAdminClient {
  readPostById(id: string): Promise<GhostAdminPost>;
  readPostRevisionById(id: string): Promise<string | null>;
  listPosts(): Promise<GhostAdminPostSummary[]>;
}

export type GhostAdminFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface GhostAdminClientOptions {
  locals?: RuntimeEnvLocals;
  url?: string | null;
  adminApiKey?: string | null;
  fetch?: GhostAdminFetch;
  now?: () => number;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

export function isGhostAdminPostId(value: string): boolean {
  return GHOST_POST_ID_PATTERN.test(value);
}

function decodeHex(value: string): Uint8Array {
  return Uint8Array.from(value.match(/.{2}/gu) ?? [], (pair) => Number.parseInt(pair, 16));
}

function splitAdminApiKey(value: string): { id: string; secret: Uint8Array } {
  const match = GHOST_ADMIN_KEY_PATTERN.exec(value.trim());

  if (!match) {
    throw new GhostAdminClientError(
      'invalid_configuration',
      'Invalid Ghost Admin configuration.',
    );
  }

  const [, id, secret] = match;

  return { id, secret: decodeHex(secret) };
}

function adminApiBase(url: string): URL {
  try {
    const base = new URL(url.trim());
    const isHttp = base.protocol === 'http:' || base.protocol === 'https:';

    if (
      !isHttp
      || base.username
      || base.password
      || base.search
      || base.hash
    ) {
      throw new Error('Invalid Ghost origin');
    }

    base.pathname = `${base.pathname.replace(/\/+$/u, '')}/ghost/api/admin/`;
    return base;
  } catch {
    throw new GhostAdminClientError(
      'invalid_configuration',
      'Invalid Ghost Admin configuration.',
    );
  }
}

function normalizeTimeout(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_GHOST_ADMIN_TIMEOUT_MS;
  }

  return Math.min(Math.floor(value), MAX_GHOST_ADMIN_TIMEOUT_MS);
}

function normalizeMaxResponseBytes(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_GHOST_ADMIN_MAX_RESPONSE_BYTES;
  }

  return Math.min(Math.floor(value), MAX_GHOST_ADMIN_MAX_RESPONSE_BYTES);
}

function exceedsDeclaredResponseLimit(response: Response, maxBytes: number): boolean {
  const rawLength = response.headers.get('Content-Length');
  if (!rawLength || !/^\d+$/u.test(rawLength)) return false;

  return Number(rawLength) > maxBytes;
}

function invalidResponseError(): GhostAdminClientError {
  return new GhostAdminClientError(
    'invalid_response',
    'Ghost Admin returned an invalid response.',
  );
}

async function readBoundedJson(response: Response, maxBytes: number): Promise<unknown> {
  if (exceedsDeclaredResponseLimit(response, maxBytes)) {
    throw invalidResponseError();
  }

  const reader = response.body?.getReader();
  if (!reader) throw invalidResponseError();

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw invalidResponseError();
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof GhostAdminClientError) throw error;
    throw invalidResponseError();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw invalidResponseError();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parsePostResponse(payload: unknown, requestedId: string): GhostAdminPost | null {
  if (!isRecord(payload) || !Array.isArray(payload.posts) || payload.posts.length !== 1) {
    return null;
  }

  const post = payload.posts[0];
  if (!isRecord(post)) return null;

  const { id, uuid, slug, title, html, status, updated_at: updatedAt } = post;
  const hasValidRequiredFields =
    typeof id === 'string'
    && GHOST_POST_ID_PATTERN.test(id)
    && id.toLowerCase() === requestedId.toLowerCase()
    && typeof uuid === 'string'
    && GHOST_POST_UUID_PATTERN.test(uuid)
    && typeof slug === 'string'
    && Boolean(slug.trim())
    && typeof title === 'string'
    && typeof html === 'string'
    && typeof status === 'string'
    && Boolean(status.trim());
  const hasValidUpdatedAt = updatedAt === undefined
    || updatedAt === null
    || typeof updatedAt === 'string';

  if (!hasValidRequiredFields || !hasValidUpdatedAt) return null;

  return {
    id,
    uuid,
    slug,
    title,
    html,
    status,
    updatedAt: updatedAt ?? null,
  };
}

function parsePostRevisionResponse(
  payload: unknown,
  requestedId: string,
): { updatedAt: string | null } | null {
  if (!isRecord(payload) || !Array.isArray(payload.posts) || payload.posts.length !== 1) {
    return null;
  }

  const post = payload.posts[0];
  if (!isRecord(post)) return null;
  const { id, updated_at: updatedAt } = post;
  if (
    typeof id !== 'string'
    || !GHOST_POST_ID_PATTERN.test(id)
    || id.toLowerCase() !== requestedId.toLowerCase()
    || (updatedAt !== null && typeof updatedAt !== 'string')
  ) {
    return null;
  }

  return { updatedAt };
}

function parsePostSummary(value: unknown): GhostAdminPostSummary | null {
  if (!isRecord(value)) return null;

  const {
    id,
    uuid,
    slug,
    title,
    status,
    updated_at: updatedAt,
    published_at: publishedAt,
  } = value;
  const hasValidRequiredFields =
    typeof id === 'string'
    && GHOST_POST_ID_PATTERN.test(id)
    && typeof uuid === 'string'
    && GHOST_POST_UUID_PATTERN.test(uuid)
    && typeof slug === 'string'
    && Boolean(slug.trim())
    && typeof title === 'string'
    && typeof status === 'string'
    && Boolean(status.trim());
  const hasValidUpdatedAt = updatedAt === undefined
    || updatedAt === null
    || typeof updatedAt === 'string';
  const hasValidPublishedAt = publishedAt === undefined
    || publishedAt === null
    || typeof publishedAt === 'string';

  if (!hasValidRequiredFields || !hasValidUpdatedAt || !hasValidPublishedAt) return null;

  return {
    id,
    uuid,
    slug,
    title,
    status,
    updatedAt: updatedAt ?? null,
    publishedAt: publishedAt ?? null,
  };
}

function parsePostsListResponse(payload: unknown): GhostAdminPostSummary[] | null {
  if (!isRecord(payload) || !Array.isArray(payload.posts)) return null;

  const posts: GhostAdminPostSummary[] = [];
  for (const rawPost of payload.posts) {
    const post = parsePostSummary(rawPost);
    if (!post) return null;
    posts.push(post);
  }

  return posts;
}

export function createGhostAdminClient(options: GhostAdminClientOptions): GhostAdminClient {
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const timeoutMs = normalizeTimeout(options.timeoutMs);
  const maxResponseBytes = normalizeMaxResponseBytes(options.maxResponseBytes);
  const adminApiKey = options.adminApiKey
    ?? readOptionalEnv(options.locals, 'GHOST_ADMIN_API_KEY')
    ?? '';
  const ghostUrl = options.url
    ?? readOptionalEnv(options.locals, 'PUBLIC_GHOST_URL')
    ?? '';
  const key = splitAdminApiKey(adminApiKey);
  const apiBase = adminApiBase(ghostUrl);

  const signAdminToken = async (): Promise<string> => {
    const nowSeconds = Math.floor(now() / 1000);
    return new SignJWT()
      .setProtectedHeader({ alg: 'HS256', kid: key.id, typ: 'JWT' })
      .setIssuedAt(nowSeconds)
      .setExpirationTime(nowSeconds + GHOST_ADMIN_TOKEN_TTL_SECONDS)
      .setAudience('/admin/')
      .sign(key.secret);
  };

  // Shared fetch: signs a fresh token, applies the request timeout to both
  // the network round trip and the bounded body read, and maps failures to
  // GhostAdminClientError. Used by both single-post lookups and listPosts.
  const fetchAdminJson = async (url: URL): Promise<unknown> => {
    const token = await signAdminToken();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new GhostAdminClientError(
            'timeout',
            'Ghost Admin request timed out.',
          ));
        }, timeoutMs);
      });
      const response = await Promise.race([
        fetchImpl(url.toString(), {
          method: 'GET',
          cache: 'no-store',
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
            'Accept-Version': GHOST_ADMIN_API_VERSION,
            Authorization: `Ghost ${token}`,
          },
        }),
        timeout,
      ]);

      if (response.status === 404) {
        throw new GhostAdminClientError(
          'not_found',
          'Ghost Admin post was not found.',
          response.status,
        );
      }
      if (!response.ok) {
        throw new GhostAdminClientError(
          'request_failed',
          'Ghost Admin request failed.',
          response.status,
        );
      }

      return await Promise.race([
        readBoundedJson(response, maxResponseBytes),
        timeout,
      ]);
    } catch (error) {
      if (controller.signal.aborted) {
        throw new GhostAdminClientError(
          'timeout',
          'Ghost Admin request timed out.',
        );
      }
      if (error instanceof GhostAdminClientError) throw error;
      throw new GhostAdminClientError(
        'request_failed',
        'Ghost Admin request failed.',
      );
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const readPostPayload = (id: string, fields?: string): Promise<unknown> => {
    if (!isGhostAdminPostId(id)) {
      throw new GhostAdminClientError(
        'invalid_identifier',
        'Invalid Ghost Admin post ID.',
      );
    }

    const url = new URL(`posts/${id}/`, apiBase);
    if (fields) url.searchParams.set('fields', fields);
    else url.searchParams.set('formats', 'html');
    return fetchAdminJson(url);
  };

  const listPostsPayload = (): Promise<unknown> => {
    const url = new URL('posts/', apiBase);
    url.searchParams.set('fields', 'id,uuid,slug,title,status,updated_at,published_at');
    url.searchParams.set('order', 'updated_at desc');
    url.searchParams.set('limit', '100');
    url.searchParams.set('formats', '');
    return fetchAdminJson(url);
  };

  return {
    async readPostById(id: string): Promise<GhostAdminPost> {
      const post = parsePostResponse(await readPostPayload(id), id);
      if (!post) throw invalidResponseError();
      return post;
    },
    async readPostRevisionById(id: string): Promise<string | null> {
      const revision = parsePostRevisionResponse(
        await readPostPayload(id, 'id,updated_at'),
        id,
      );
      if (!revision) throw invalidResponseError();
      return revision.updatedAt;
    },
    async listPosts(): Promise<GhostAdminPostSummary[]> {
      const posts = parsePostsListResponse(await listPostsPayload());
      if (!posts) throw invalidResponseError();
      return posts;
    },
  };
}
