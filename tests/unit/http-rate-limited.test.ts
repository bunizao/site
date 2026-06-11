import { describe, expect, test } from 'bun:test';

import { withRateLimit } from '../../src/lib/http/rate-limited';

function createRequest(ip: string): Request {
  return new Request('https://example.com/api/test', {
    headers: {
      'x-real-ip': ip,
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

  test('does not read removed Astro runtime env getter', () => {
    const locals = {
      runtime: {
        get env() {
          throw new Error('Astro.locals.runtime.env has been removed');
        },
      },
    };

    const state = withRateLimit(
      createRequest('203.0.113.12'),
      { windowMs: 60_000, max: 2, prefix: `test:runtime:${Date.now()}` },
      locals
    );

    expect(state.allowed).toBe(true);
    expect(state.result.key).toContain('203.0.113.12');
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
});
