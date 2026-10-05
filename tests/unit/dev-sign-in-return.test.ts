import { describe, expect, test } from 'bun:test';
import { ALL } from '../../src/pages/dev';

type Handler = (context: { url: URL }) => Response;

function redirectFor(path: string): string | null {
  return (ALL as unknown as Handler)({ url: new URL(path, 'https://buxx.me') }).headers.get('location');
}

describe('/dev sign-in return', () => {
  test('lands on the portal by default', () => {
    expect(redirectFor('/dev')).toBe('/dev/portal');
  });

  test('returns to the locked docs page that sent the owner', () => {
    expect(redirectFor('/dev?next=/docs/api/endpoints')).toBe('/docs/api/endpoints');
  });

  test.each([
    'https://evil.example/docs/x',
    '//evil.example/docs/x',
    '/\\evil.example',
    '/docs/../dev/portal',
    '/docs/api/endpoints?x=1',
    '/blog/post',
    '/docs/',
  ])('ignores %s', (next) => {
    expect(redirectFor(`/dev?next=${encodeURIComponent(next)}`)).toBe('/dev/portal');
  });
});
