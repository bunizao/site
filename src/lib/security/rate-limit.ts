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

// This best-effort store is isolated per Worker instance and resets with that isolate.
const rateLimitStore = new Map<string, RateLimitState>();
const MAX_STORE_SIZE = 10000;

// Cloudflare sets cf-connecting-ip on every request and overwrites any client
// value. Local dev has no such header, so every dev request shares one bucket.
function getClientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip')?.trim() || 'anonymous';
}

function enforceStoreLimit(): void {
  while (rateLimitStore.size >= MAX_STORE_SIZE) {
    const oldestKey = rateLimitStore.keys().next().value;
    if (!oldestKey) return;
    rateLimitStore.delete(oldestKey);
  }
}

export function checkRateLimit(request: Request, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const ip = getClientIp(request);
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
