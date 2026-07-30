import { createHmac, timingSafeEqual } from 'node:crypto';
import { readEnv, type RuntimeEnvLocals } from '@/lib/runtime/env';

// Server-only: this module reads Worker secrets and must not enter browser bundles.

export interface StaticProxySigningKey {
  id: string;
  secret: string;
}

export interface StaticProxyKeyRing {
  current: StaticProxySigningKey;
  previous?: StaticProxySigningKey;
}

interface MintStaticProxyUrlOptions {
  expiresAt?: number;
  now?: number;
}

interface VerifyStaticProxyUrlOptions {
  now?: number;
}

export type StaticProxyVerification =
  | {
      status: 'valid';
      targetUrl: string;
      keyId: string;
      expiresAt: number;
    }
  | {
      status: 'unsigned';
      targetUrl: null;
    }
  | {
      status: 'invalid';
      targetUrl: string | null;
      reason: 'malformed' | 'unknown-key' | 'signature' | 'expired';
    };

const DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60;

function canonicalizeTargetUrl(targetUrl: string): string {
  const invalidTarget = () => new TypeError(
    'Static proxy target must be an absolute HTTP(S) URL',
  );
  if (!/^https?:\/\/[^/\\?#\s]/iu.test(targetUrl)) throw invalidTarget();

  let url: URL;
  try {
    url = new URL(targetUrl);
  } catch {
    throw invalidTarget();
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname) {
    throw invalidTarget();
  }
  if (url.username || url.password) {
    throw new TypeError('Static proxy target must not include credentials');
  }
  url.hash = '';
  return url.href;
}

function signPayload(key: StaticProxySigningKey, targetUrl: string, expiresAt: number): string {
  return createHmac('sha256', key.secret)
    .update(`${key.id}\n${targetUrl}\n${expiresAt}`)
    .digest('base64url');
}

function decodeTargetPath(pathname: string): string | null {
  const match = /^\/static\/([A-Za-z0-9_-]+)$/.exec(pathname);
  if (!match) return null;

  const encodedTarget = match[1];
  const bytes = Buffer.from(encodedTarget, 'base64url');
  if (bytes.toString('base64url') !== encodedTarget) return null;

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function signaturesMatch(actual: string, expected: string): boolean {
  const expectedBytes = Buffer.from(expected, 'utf8');
  const actualBytes = Buffer.alloc(expectedBytes.length);
  const suppliedBytes = Buffer.from(actual, 'utf8');
  suppliedBytes.copy(actualBytes, 0, 0, expectedBytes.length);

  return timingSafeEqual(actualBytes, expectedBytes) && suppliedBytes.length === expectedBytes.length;
}

export function mintStaticProxyUrl(
  targetUrl: string,
  keyRing: StaticProxyKeyRing,
  options: MintStaticProxyUrlOptions = {}
): string {
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const expiresAt = options.expiresAt ?? now + DEFAULT_TTL_SECONDS;
  if (!Number.isSafeInteger(expiresAt)) {
    throw new TypeError('Static proxy expiry must be an integer');
  }
  const canonicalTargetUrl = canonicalizeTargetUrl(targetUrl);
  const encodedTarget = Buffer.from(canonicalTargetUrl, 'utf8').toString('base64url');
  const signature = signPayload(keyRing.current, canonicalTargetUrl, expiresAt);
  const query = new URLSearchParams({
    k: keyRing.current.id,
    e: String(expiresAt),
    s: signature,
  });

  return `/static/${encodedTarget}?${query}`;
}

export function readStaticProxyKeyRing(
  locals: RuntimeEnvLocals | undefined
): StaticProxyKeyRing | null {
  const currentId = readEnv(locals, 'STATIC_PROXY_KEY_ID');
  const currentSecret = readEnv(locals, 'STATIC_PROXY_SECRET');
  if (!currentId || !currentSecret) return null;

  const previousId = readEnv(locals, 'STATIC_PROXY_PREVIOUS_KEY_ID');
  const previousSecret = readEnv(locals, 'STATIC_PROXY_PREVIOUS_SECRET');

  return {
    current: { id: currentId, secret: currentSecret },
    ...(previousId && previousSecret
      ? { previous: { id: previousId, secret: previousSecret } }
      : {}),
  };
}

export function verifyStaticProxyUrl(
  requestUrl: URL,
  keyRing: StaticProxyKeyRing | null,
  options: VerifyStaticProxyUrlOptions = {}
): StaticProxyVerification {
  const signatureFields = ['k', 'e', 's'] as const;
  const hasSignatureField = signatureFields.some((name) => requestUrl.searchParams.has(name));
  if (!hasSignatureField) {
    return { status: 'unsigned', targetUrl: null };
  }

  const targetUrl = decodeTargetPath(requestUrl.pathname);
  const hasCanonicalFields = signatureFields.every(
    (name) => requestUrl.searchParams.getAll(name).length === 1
  );
  const hasOnlySignatureFields = Array.from(requestUrl.searchParams.keys()).every(
    (name) => signatureFields.includes(name as (typeof signatureFields)[number])
  );
  const keyId = requestUrl.searchParams.get('k') ?? '';
  const expiryValue = requestUrl.searchParams.get('e') ?? '';
  const signature = requestUrl.searchParams.get('s') ?? '';
  const expiresAt = /^\d+$/.test(expiryValue) ? Number(expiryValue) : Number.NaN;

  if (
    !targetUrl
    || !hasCanonicalFields
    || !hasOnlySignatureFields
    || !Number.isSafeInteger(expiresAt)
  ) {
    return { status: 'invalid', targetUrl, reason: 'malformed' };
  }

  const matchingKey = keyRing?.current.id === keyId
    ? keyRing.current
    : keyRing?.previous?.id === keyId
      ? keyRing.previous
      : null;

  if (!keyRing) {
    return { status: 'invalid', targetUrl, reason: 'unknown-key' };
  }

  const comparisonKey = matchingKey ?? keyRing.current;
  const expectedSignature = signPayload(comparisonKey, targetUrl, expiresAt);
  const signatureIsValid = signaturesMatch(signature, expectedSignature);

  if (!matchingKey) {
    return { status: 'invalid', targetUrl, reason: 'unknown-key' };
  }
  if (!signatureIsValid) {
    return { status: 'invalid', targetUrl, reason: 'signature' };
  }

  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (expiresAt < now) {
    return { status: 'invalid', targetUrl, reason: 'expired' };
  }

  return {
    status: 'valid',
    targetUrl,
    keyId,
    expiresAt,
  };
}
