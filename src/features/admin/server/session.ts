import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readEnv } from '@/lib/runtime/env';

export interface AdminSession {
  login: string;
  iat: number;
  exp: number;
  avatarUrl?: string;
}

export interface AdminAuthConfig {
  clientId: string;
  clientSecret: string;
  allowedLogin: string;
  sessionSigningKey: string;
}

export const ADMIN_SESSION_COOKIE = 'admin_session';
export const ADMIN_OAUTH_STATE_COOKIE = 'admin_oauth_state';

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const STATE_TTL_SECONDS = 10 * 60;
const LOCALHOST_NAMES = new Set(['localhost', '::1']);
const DEFAULT_ADMIN_NEXT_PATH = '/dev/portal';
const DOCS_NEXT_PATH = '/docs';
const HMAC_ALGORITHM = { name: 'HMAC', hash: 'SHA-256' } as const;

export function readAdminAuthConfig(locals: any): AdminAuthConfig {
  return {
    clientId: readEnv(locals, 'GITHUB_OAUTH_CLIENT_ID'),
    clientSecret: readEnv(locals, 'GITHUB_OAUTH_CLIENT_SECRET'),
    allowedLogin: readEnv(locals, 'ADMIN_GITHUB_LOGIN'),
    sessionSigningKey: readEnv(locals, 'ADMIN_SESSION_SECRET'),
  };
}

export function readAdminDevSession(
  locals: any,
  isDev: boolean,
  hostname: string,
  now = Math.floor(Date.now() / 1000)
): AdminSession | null {
  if (!isDev || readEnv(locals, 'ADMIN_DEV_BYPASS') !== '1' || !isLocalAdminDevHost(hostname)) {
    return null;
  }

  const login = readEnv(locals, 'ADMIN_DEV_LOGIN') || readEnv(locals, 'ADMIN_GITHUB_LOGIN') || 'local-dev';
  const configuredAvatar = readEnv(locals, 'ADMIN_DEV_AVATAR_URL').trim();
  const avatarUrl = configuredAvatar || (login === 'local-dev' ? '' : `https://github.com/${encodeURIComponent(login)}.png?size=56`);
  return {
    login,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
    ...(avatarUrl ? { avatarUrl } : {}),
  };
}

export function isLocalAdminDevHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  return LOCALHOST_NAMES.has(normalized) || normalized.startsWith('127.');
}

export function isAdminAuthConfigured(config: AdminAuthConfig): boolean {
  return Boolean(
    config.clientId
    && config.clientSecret
    && config.allowedLogin
    && config.sessionSigningKey
  );
}

export function normalizeAdminNextPath(value: string | null | undefined): string {
  const trimmed = value?.trim() || DEFAULT_ADMIN_NEXT_PATH;
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\')) {
    return DEFAULT_ADMIN_NEXT_PATH;
  }

  try {
    const url = new URL(trimmed, 'https://buxx.me');
    if (url.origin !== 'https://buxx.me') {
      return DEFAULT_ADMIN_NEXT_PATH;
    }

    const next = `${url.pathname}${url.search}${url.hash}`;
    if (next === DEFAULT_ADMIN_NEXT_PATH || next.startsWith(`${DEFAULT_ADMIN_NEXT_PATH}/`)) {
      return next;
    }
    if (next === DOCS_NEXT_PATH || next.startsWith(`${DOCS_NEXT_PATH}/`)) {
      return next;
    }
  } catch {
    return DEFAULT_ADMIN_NEXT_PATH;
  }

  return DEFAULT_ADMIN_NEXT_PATH;
}

function base64UrlEncode(value: string | Buffer): string {
  const buffer = typeof value === 'string' ? Buffer.from(value, 'utf8') : value;
  return buffer.toString('base64url');
}

function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

async function importSigningKey(signingKey: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(signingKey),
    HMAC_ALGORITHM,
    false,
    ['sign']
  );
}

async function signPayload(payload: string, signingKey: string): Promise<string> {
  const key = await importSigningKey(signingKey);
  const signature = await crypto.subtle.sign(
    HMAC_ALGORITHM.name,
    key,
    new TextEncoder().encode(payload)
  );
  return Buffer.from(signature).toString('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export async function createSessionToken(
  login: string,
  signingKey: string,
  now = Math.floor(Date.now() / 1000),
  extra: { avatarUrl?: string } = {}
): Promise<string> {
  const session: AdminSession = {
    login,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
    ...(extra.avatarUrl ? { avatarUrl: extra.avatarUrl } : {}),
  };
  const encoded = base64UrlEncode(JSON.stringify(session));
  const signature = await signPayload(encoded, signingKey);
  return `${encoded}.${signature}`;
}

export async function verifySessionToken(token: string, signingKey: string): Promise<AdminSession | null> {
  if (!token || !signingKey) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  const expected = await signPayload(encoded, signingKey);
  if (!safeEqual(signature, expected)) return null;

  let session: AdminSession;
  try {
    session = JSON.parse(base64UrlDecode(encoded).toString('utf8')) as AdminSession;
  } catch {
    return null;
  }

  if (typeof session.login !== 'string' || !session.login) return null;
  if (typeof session.exp !== 'number' || session.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }
  if (session.avatarUrl !== undefined && typeof session.avatarUrl !== 'string') {
    session.avatarUrl = undefined;
  }
  return session;
}

export async function createOauthState(
  signingKey: string,
  next: string,
  now = Math.floor(Date.now() / 1000)
): Promise<string> {
  const payload = JSON.stringify({
    nonce: randomBytes(16).toString('hex'),
    next: normalizeAdminNextPath(next),
    exp: now + STATE_TTL_SECONDS,
  });
  const encoded = base64UrlEncode(payload);
  const signature = await signPayload(encoded, signingKey);
  return `${encoded}.${signature}`;
}

export async function verifyOauthState(token: string, signingKey: string): Promise<{ next: string } | null> {
  if (!token || !signingKey) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  const expected = await signPayload(encoded, signingKey);
  if (!safeEqual(signature, expected)) return null;

  let payload: { nonce?: string; next?: string; exp?: number };
  try {
    payload = JSON.parse(base64UrlDecode(encoded).toString('utf8'));
  } catch {
    return null;
  }

  if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  const next = normalizeAdminNextPath(payload.next);
  return { next };
}

export function buildSessionCookie(token: string): string {
  return `${ADMIN_SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function buildClearSessionCookie(): string {
  return `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function buildStateCookie(token: string): string {
  return `${ADMIN_OAUTH_STATE_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${STATE_TTL_SECONDS}`;
}

export function buildClearStateCookie(): string {
  return `${ADMIN_OAUTH_STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function readSessionFromCookieHeader(cookieHeader: string | null | undefined): string {
  if (!cookieHeader) return '';
  for (const segment of cookieHeader.split(';')) {
    const [rawName, ...rest] = segment.trim().split('=');
    if (rawName === ADMIN_SESSION_COOKIE) {
      return rest.join('=').trim();
    }
  }
  return '';
}

export function readStateFromCookieHeader(cookieHeader: string | null | undefined): string {
  if (!cookieHeader) return '';
  for (const segment of cookieHeader.split(';')) {
    const [rawName, ...rest] = segment.trim().split('=');
    if (rawName === ADMIN_OAUTH_STATE_COOKIE) {
      return rest.join('=').trim();
    }
  }
  return '';
}

export function isAllowedLogin(login: string, allowed: string): boolean {
  if (!login || !allowed) return false;
  return login.trim().toLowerCase() === allowed.trim().toLowerCase();
}
