import { createHmac } from 'node:crypto';
import { readEnv } from '@/lib/runtime/env';

function secureCompareText(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let mismatch = leftBytes.length ^ rightBytes.length;
  const maxLength = Math.max(leftBytes.length, rightBytes.length);

  for (let index = 0; index < maxLength; index += 1) {
    mismatch |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return mismatch === 0;
}

function normalizeSearchParams(searchParams: URLSearchParams): string {
  const entries = Array.from(searchParams.entries())
    .filter(([key]) => key !== 'sig')
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      if (leftKey === rightKey) {
        return leftValue.localeCompare(rightValue);
      }

      return leftKey.localeCompare(rightKey);
    });

  return new URLSearchParams(entries).toString();
}

function buildSignedPayload(pathname: string, searchParams: URLSearchParams): string {
  const normalizedSearch = normalizeSearchParams(searchParams);
  return normalizedSearch ? `${pathname}?${normalizedSearch}` : pathname;
}

export function readRuntimeEnv(locals: any, name: string): string {
  return readEnv(locals, name);
}

export function signRequestPath(
  pathname: string,
  searchParams: URLSearchParams,
  secret: string
): string {
  return createHmac('sha256', secret)
    .update(buildSignedPayload(pathname, searchParams))
    .digest('base64url');
}

export function signedRequestPath(
  pathname: string,
  searchParams: URLSearchParams,
  secret: string,
  expiresAt: number
): string {
  const signedParams = new URLSearchParams(searchParams);
  signedParams.set('exp', String(expiresAt));
  signedParams.set('sig', signRequestPath(pathname, signedParams, secret));
  const query = signedParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function verifySignedRequestUrl(requestUrl: URL, secret: string): boolean {
  const signature = requestUrl.searchParams.get('sig')?.trim() ?? '';
  const expiresAt = Number(requestUrl.searchParams.get('exp') ?? '');

  if (!signature || !Number.isFinite(expiresAt)) {
    return false;
  }

  if (expiresAt < Math.floor(Date.now() / 1000)) {
    return false;
  }

  const expectedSignature = signRequestPath(requestUrl.pathname, requestUrl.searchParams, secret);
  return secureCompareText(signature, expectedSignature);
}
