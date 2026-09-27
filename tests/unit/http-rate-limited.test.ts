import { describe, expect, test } from 'bun:test';

import { withRateLimit } from '../../src/lib/http/rate-limited';

function createRequest(ip: string, headerName = 'cf-connecting-ip'): Request {
  return new Request('https://example.com/api/test', {
    headers: {
      [headerName]: ip,
    },
  });
}

describe('rate-limit helper', () => {
  test('returns headers for allowed requests', () => {
    const state = withRateLimit(createRequest('203.0.113.10'), {
      windowMs: 60_000,
      max: 2,
      prefix: `test:allowed:${Date.now()}`,
    });

    expect(state.allowed).toBe(true);
    expect(state.headers.get('X-RateLimit-Limit')).toBe('2');
    expect(state.headers.get('X-RateLimit-Remaining')).toBe('1');
    expect(state.headers.get('Retry-After')).toBeNull();
  });

  test('keys buckets by the Cloudflare client IP only', () => {
    const prefix = `test:ip:${Date.now()}`;
    const options = { windowMs: 60_000, max: 2, prefix };

    expect(withRateLimit(createRequest('203.0.113.12'), options).result.key).toBe(`${prefix}:203.0.113.12`);
    // A client-supplied forwarding header must not pick its own bucket.
    expect(withRateLimit(createRequest('198.51.100.1', 'x-forwarded-for'), options).result.key)
      .toBe(`${prefix}:anonymous`);
  });

  test('marks subsequent over-limit requests as blocked', () => {
    const prefix = `test:blocked:${Date.now()}`;

    const first = withRateLimit(createRequest('203.0.113.11'), {
      windowMs: 60_000,
      max: 1,
      prefix,
    });
    const second = withRateLimit(createRequest('203.0.113.11'), {
      windowMs: 60_000,
      max: 1,
      prefix,
    });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
    expect(second.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(second.headers.get('Retry-After')).not.toBeNull();
  });

  test('opens a fresh window once the previous one has expired', async () => {
    const options = { windowMs: 1, max: 1, prefix: `test:window:${Date.now()}` };

    expect(withRateLimit(createRequest('203.0.113.13'), options).allowed).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(withRateLimit(createRequest('203.0.113.13'), options).allowed).toBe(true);
  });
});
