import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readEnv } from '@/lib/runtime/env';

export interface AdminSession {
  login: string;
  iat: number;
  exp: number;
}

export interface AdminAuthConfig {
  clientId: string;
  clientSecret: string;
  allowedLogin: string;
  sessionSecret: string;
}

export const ADMIN_SESSION_COOKIE = 'admin_session';
export const ADMIN_OAUTH_STATE_COOKIE = 'admin_oauth_state';

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const STATE_TTL_SECONDS = 10 * 60;

export function readAdminAuthConfig(locals: any): AdminAuthConfig {
  return {
    clientId: readEnv(locals, 'GITHUB_OAUTH_CLIENT_ID'),
    clientSecret: readEnv(locals, 'GITHUB_OAUTH_CLIENT_SECRET'),
    allowedLogin: readEnv(locals, 'ADMIN_GITHUB_LOGIN'),
    sessionSecret: readEnv(locals, 'ADMIN_SESSION_SECRET'),
  };
}

export function readAdminDevSession(
  locals: any,
  isDev: boolean,
  now = Math.floor(Date.now() / 1000)
): AdminSession | null {
  if (!isDev || readEnv(locals, 'ADMIN_DEV_BYPASS') !== '1') {
    return null;
  }

  const login = readEnv(locals, 'ADMIN_DEV_LOGIN') || readEnv(locals, 'ADMIN_GITHUB_LOGIN') || 'local-dev';
  return {
    login,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };
}

export function isAdminAuthConfigured(config: AdminAuthConfig): boolean {
  return Boolean(
    config.clientId
    && config.clientSecret
    && config.allowedLogin
    && config.sessionSecret
  );
}

function base64UrlEncode(value: string | Buffer): string {
  const buffer = typeof value === 'string' ? Buffer.from(value, 'utf8') : value;
  return buffer.toString('base64url');
}

function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export function createSessionToken(login: string, secret: string, now = Math.floor(Date.now() / 1000)): string {
  const session: AdminSession = {
    login,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };
  const encoded = base64UrlEncode(JSON.stringify(session));
  const signature = signPayload(encoded, secret);
  return `${encoded}.${signature}`;
}

export function verifySessionToken(token: string, secret: string): AdminSession | null {
  if (!token || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  const expected = signPayload(encoded, secret);
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
  return session;
}

export function createOauthState(secret: string, next: string, now = Math.floor(Date.now() / 1000)): string {
  const payload = JSON.stringify({
    nonce: randomBytes(16).toString('hex'),
    next: next || '/dev/portal',
    exp: now + STATE_TTL_SECONDS,
  });
  const encoded = base64UrlEncode(payload);
  const signature = signPayload(encoded, secret);
  return `${encoded}.${signature}`;
}

export function verifyOauthState(token: string, secret: string): { next: string } | null {
  if (!token || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  const expected = signPayload(encoded, secret);
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

  const next = typeof payload.next === 'string' && payload.next.startsWith('/') ? payload.next : '/dev/portal';
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
