import {
  checkRateLimit,
  createRateLimitHeaders,
  type RateLimitResult,
} from '@/lib/security/rate-limit';

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  prefix: string;
}

export interface RateLimitState {
  allowed: boolean;
  headers: Headers;
  result: RateLimitResult;
}

export function withRateLimit(request: Request, options: RateLimitOptions): RateLimitState {
  const result = checkRateLimit(request, options);
  return {
    allowed: result.allowed,
    headers: createRateLimitHeaders(result),
    result,
  };
}
