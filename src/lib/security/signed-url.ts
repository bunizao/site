import { createHmac } from 'node:crypto';
import { readEnv, type RuntimeEnvLocals } from '@/lib/runtime/env';

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

export function readRuntimeEnv(locals: RuntimeEnvLocals | undefined, name: string): string {
  return readEnv(locals, name);
}

export function signRequestPath(
  pathname: string,
  searchParams: URLSearchParams,
  secret: string,
): string {
  return createHmac('sha256', secret)
    .update(buildSignedPayload(pathname, searchParams))
    .digest('base64url');
}

export function signedRequestPath(
  pathname: string,
  searchParams: URLSearchParams,
  secret: string,
  expiresAt: number,
): string {
  const signedParams = new URLSearchParams(searchParams);
  signedParams.set('exp', String(expiresAt));
  signedParams.set('sig', signRequestPath(pathname, signedParams, secret));
  const query = signedParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}
