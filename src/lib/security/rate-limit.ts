import { readRuntimeValue } from '@/lib/runtime/env';

interface RateLimitConfig {
  windowMs: number;
  max: number;
  prefix: string;
}

interface RateLimitState {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
  key: string;
}

const rateLimitStore = new Map<string, RateLimitState>();
const MAX_STORE_SIZE = 10000;

function normalizeIpCandidate(
  value: string | null,
  { takeLast = false }: { takeLast?: boolean } = {}
): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';

  const parts = trimmed
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const candidate = (takeLast ? parts[parts.length - 1] : parts[0]) ?? '';
  if (!candidate) return '';

  if (candidate.length > 128) return '';
  if (!/^[a-z0-9:.[\]%-]+$/i.test(candidate)) return '';
  return candidate.toLowerCase();
}

function getClientIp(request: Request, locals?: any): string {
  let runtimeClientIp = '';
  try {
    runtimeClientIp = typeof locals?.runtime?.ip === 'string' ? locals.runtime.ip : '';
  } catch {
    runtimeClientIp = '';
  }

  const runtimeIp =
    runtimeClientIp ||
    readRuntimeValue(locals, 'REMOTE_ADDR') ||
    '';
  const normalizedRuntimeIp = normalizeIpCandidate(runtimeIp);
  if (normalizedRuntimeIp) return normalizedRuntimeIp;

  const trustedHeaderOrder = [
    'cf-connecting-ip',
    'x-real-ip',
    'true-client-ip',
    'fly-client-ip',
  ];
  for (const headerName of trustedHeaderOrder) {
    const candidate = normalizeIpCandidate(request.headers.get(headerName));
    if (candidate) return candidate;
  }

  const forwardedForIp = normalizeIpCandidate(request.headers.get('x-forwarded-for'), {
    takeLast: true,
  });
  if (forwardedForIp) return forwardedForIp;

  const fallbackIp = normalizeIpCandidate(request.headers.get('x-client-ip'));
  if (fallbackIp) return fallbackIp;

  return 'anonymous';
}

function cleanupExpiredEntries(now: number): void {
  for (const [key, state] of rateLimitStore.entries()) {
    if (state.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}

function enforceStoreLimit(): void {
  while (rateLimitStore.size >= MAX_STORE_SIZE) {
    const oldestKey = rateLimitStore.keys().next().value;
    if (!oldestKey) return;
    rateLimitStore.delete(oldestKey);
  }
}

export function checkRateLimit(
  request: Request,
  config: RateLimitConfig,
  locals?: any
): RateLimitResult {
  const now = Date.now();
  cleanupExpiredEntries(now);

  const ip = getClientIp(request, locals);
  const key = `${config.prefix}:${ip}`;
  const existing = rateLimitStore.get(key);

  let state: RateLimitState;
  if (!existing || existing.resetAt <= now) {
    enforceStoreLimit();
    state = {
      count: 0,
      resetAt: now + config.windowMs,
    };
    rateLimitStore.set(key, state);
  } else {
    state = existing;
  }

  if (state.count >= config.max) {
    const retryAfterSeconds = Math.max(1, Math.ceil((state.resetAt - now) / 1000));
    return {
      allowed: false,
      limit: config.max,
      remaining: 0,
      resetAt: state.resetAt,
      retryAfterSeconds,
      key,
    };
  }

  state.count += 1;
  const remaining = Math.max(0, config.max - state.count);
  const retryAfterSeconds = Math.max(1, Math.ceil((state.resetAt - now) / 1000));

  return {
    allowed: true,
    limit: config.max,
    remaining,
    resetAt: state.resetAt,
    retryAfterSeconds,
    key,
  };
}

export function createRateLimitHeaders(result: RateLimitResult): Headers {
  const headers = new Headers();
  headers.set('X-RateLimit-Limit', String(result.limit));
  headers.set('X-RateLimit-Remaining', String(result.remaining));
  headers.set('X-RateLimit-Reset', String(Math.floor(result.resetAt / 1000)));
  if (!result.allowed) {
    headers.set('Retry-After', String(result.retryAfterSeconds));
  }
  return headers;
}
