import { createHmac } from 'node:crypto';
import { secureCompareText } from '@/features/notify/server/security';

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
  const runtimeValue = locals?.runtime?.env?.[name] ?? locals?.env?.[name];
  return typeof runtimeValue === 'string' ? runtimeValue.trim() : '';
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
