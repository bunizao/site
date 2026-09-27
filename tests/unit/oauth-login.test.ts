import { describe, expect, test } from 'bun:test';
import { GET } from '../../src/pages/oauth/login';

function login(next: string): URL {
  const url = new URL(`https://buxx.me/oauth/login?next=${encodeURIComponent(next)}`);
  const response = GET({ url } as never) as Response;
  expect(response.status).toBe(302);
  expect(response.headers.get('cache-control')).toContain('no-store');
  return new URL(response.headers.get('location') ?? '');
}

describe('oauth login redirect', () => {
  test.each([
    ['tab', '/\t/example.com'],
    ['carriage return', '/\r/evil.test/x'],
    ['line feed', '/\n/evil.test/x'],
    ['protocol-relative', '//evil.test'],
    ['backslash', '/\\evil.test'],
    ['absolute URL', 'https://evil.test'],
    ['javascript URL', 'javascript:alert(1)'],
    ['unparseable host', '//['],
  ])('never redirects off the site origin (%s)', (_name, next) => {
    const target = login(next);

    expect(target.origin).toBe('https://buxx.me');
    expect(target.pathname).toBe('/dev/portal');
  });

  test('keeps a same-origin next path and its query', () => {
    const target = login('/dev/portal/analytics?range=7d');

    expect(target.href).toBe('https://buxx.me/dev/portal/analytics?range=7d');
  });

  test('defaults to the portal without a next path', () => {
    const response = GET({ url: new URL('https://buxx.me/oauth/login') } as never) as Response;

    expect(response.headers.get('location')).toBe('https://buxx.me/dev/portal');
  });
});
