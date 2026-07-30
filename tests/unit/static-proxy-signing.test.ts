import { describe, expect, test } from 'bun:test';
import {
  mintStaticProxyUrl,
  readStaticProxyKeyRing,
  type StaticProxyKeyRing,
  verifyStaticProxyUrl,
} from '../../src/lib/security/static-proxy-signing';

const keyRing: StaticProxyKeyRing = {
  current: { id: '2026-07', secret: 'current-secret' },
  previous: { id: '2026-06', secret: 'previous-secret' },
};

describe('static proxy signing', () => {
  test('mints a canonical URL from the exact target and current key', () => {
    const targetUrl = 'https://t.me/i/emoji/123.webp?size=large&format=webp';

    expect(mintStaticProxyUrl(targetUrl, keyRing, { expiresAt: 1_788_134_400 })).toBe(
      '/static/aHR0cHM6Ly90Lm1lL2kvZW1vamkvMTIzLndlYnA_c2l6ZT1sYXJnZSZmb3JtYXQ9d2VicA'
      + '?k=2026-07&e=1788134400&s=tJwGe6VIVWgEqSgHl89eOC26Ixjb0wfIojeuvXea3SI'
    );
  });

  test('canonicalizes the target and strips its fragment before signing', () => {
    const path = mintStaticProxyUrl(
      'HTTPS://EXAMPLE.COM:443/assets/../image.png?size=large#preview',
      keyRing,
      { expiresAt: 1_788_134_400 },
    );

    expect(path).toBe(
      '/static/aHR0cHM6Ly9leGFtcGxlLmNvbS9pbWFnZS5wbmc_c2l6ZT1sYXJnZQ'
      + '?k=2026-07&e=1788134400&s=NrKjwKgtpfJ3Hm9fRNF1sarIlR_AiphCKOmRH7Mb0OE'
    );
    expect(verifyStaticProxyUrl(new URL(path, 'https://buxx.me'), keyRing, {
      now: 1_788_134_399,
    })).toEqual({
      status: 'valid',
      targetUrl: 'https://example.com/image.png?size=large',
      keyId: '2026-07',
      expiresAt: 1_788_134_400,
    });
  });

  test('defaults minted URLs to a thirty-day lifetime', () => {
    const path = mintStaticProxyUrl('https://cdn4.telegram-cdn.org/image.png', keyRing, {
      now: 1_785_456_000,
    });
    const url = new URL(path, 'https://buxx.me');

    expect(url.searchParams.get('e')).toBe('1788048000');
  });

  test('verifies a canonical URL and returns its exact target query', () => {
    const url = new URL(
      'https://buxx.me/static/aHR0cHM6Ly90Lm1lL2kvZW1vamkvMTIzLndlYnA_c2l6ZT1sYXJnZSZmb3JtYXQ9d2VicA'
      + '?k=2026-07&e=1788134400&s=tJwGe6VIVWgEqSgHl89eOC26Ixjb0wfIojeuvXea3SI'
    );

    expect(verifyStaticProxyUrl(url, keyRing, { now: 1_788_134_399 })).toEqual({
      status: 'valid',
      targetUrl: 'https://t.me/i/emoji/123.webp?size=large&format=webp',
      keyId: '2026-07',
      expiresAt: 1_788_134_400,
    });
  });

  test('requires an integer expiry when minting', () => {
    expect(() => mintStaticProxyUrl('https://t.me/image.png', keyRing, {
      expiresAt: 1_788_134_400.5,
    })).toThrow('Static proxy expiry must be an integer');
  });

  test('rejects targets that are not absolute HTTP or HTTPS URLs', () => {
    const invalidTargets = [
      '/image.png',
      '//cdn4.telegram-cdn.org/image.png',
      'https:cdn4.telegram-cdn.org/image.png',
      'https:///cdn4.telegram-cdn.org/image.png',
      'ftp://cdn4.telegram-cdn.org/image.png',
      'javascript:alert(1)',
    ];

    for (const targetUrl of invalidTargets) {
      expect(() => mintStaticProxyUrl(targetUrl, keyRing)).toThrow(
        'Static proxy target must be an absolute HTTP(S) URL',
      );
    }
  });

  test('rejects targets containing credentials', () => {
    for (const targetUrl of [
      'https://reader@cdn4.telegram-cdn.org/image.png',
      'https://reader:secret@cdn4.telegram-cdn.org/image.png',
      'https://:secret@cdn4.telegram-cdn.org/image.png',
    ]) {
      expect(() => mintStaticProxyUrl(targetUrl, keyRing)).toThrow(
        'Static proxy target must not include credentials',
      );
    }
  });

  test('rejects expired signatures', () => {
    const url = new URL(
      'https://buxx.me/static/aHR0cHM6Ly90Lm1lL2kvZW1vamkvMTIzLndlYnA_c2l6ZT1sYXJnZSZmb3JtYXQ9d2VicA'
      + '?k=2026-07&e=1788134400&s=tJwGe6VIVWgEqSgHl89eOC26Ixjb0wfIojeuvXea3SI'
    );

    expect(verifyStaticProxyUrl(url, keyRing, { now: 1_788_134_401 })).toEqual({
      status: 'invalid',
      targetUrl: 'https://t.me/i/emoji/123.webp?size=large&format=webp',
      reason: 'expired',
    });
  });

  test('rejects target, expiry, and signature tampering', () => {
    const cases = [
      'https://buxx.me/static/aHR0cHM6Ly90Lm1lL2kvZW1vamkvMTIzLndlYnA_Zm9ybWF0PXdlYnAmc2l6ZT1sYXJnZQ?k=2026-07&e=1788134400&s=tJwGe6VIVWgEqSgHl89eOC26Ixjb0wfIojeuvXea3SI',
      'https://buxx.me/static/aHR0cHM6Ly90Lm1lL2kvZW1vamkvMTIzLndlYnA_c2l6ZT1sYXJnZSZmb3JtYXQ9d2VicA?k=2026-07&e=1788134401&s=tJwGe6VIVWgEqSgHl89eOC26Ixjb0wfIojeuvXea3SI',
      'https://buxx.me/static/aHR0cHM6Ly90Lm1lL2kvZW1vamkvMTIzLndlYnA_c2l6ZT1sYXJnZSZmb3JtYXQ9d2VicA?k=2026-07&e=1788134400&s=AJwGe6VIVWgEqSgHl89eOC26Ixjb0wfIojeuvXea3SI',
    ];

    for (const value of cases) {
      expect(verifyStaticProxyUrl(new URL(value), keyRing, { now: 1_788_134_399 })).toMatchObject({
        status: 'invalid',
        reason: 'signature',
      });
    }
  });

  test('treats envelope order as irrelevant and rejects non-envelope query fields', () => {
    const reordered = new URL(
      'https://buxx.me/static/aHR0cHM6Ly90Lm1lL2kvZW1vamkvMTIzLndlYnA_c2l6ZT1sYXJnZSZmb3JtYXQ9d2VicA'
      + '?s=tJwGe6VIVWgEqSgHl89eOC26Ixjb0wfIojeuvXea3SI&e=1788134400&k=2026-07'
    );
    const extraQuery = new URL(reordered);
    extraQuery.searchParams.set('size', 'small');

    expect(verifyStaticProxyUrl(reordered, keyRing, { now: 1_788_134_399 }).status).toBe('valid');
    expect(verifyStaticProxyUrl(extraQuery, keyRing, { now: 1_788_134_399 })).toEqual({
      status: 'invalid',
      targetUrl: 'https://t.me/i/emoji/123.webp?size=large&format=webp',
      reason: 'malformed',
    });
  });

  test('accepts the previous key during rotation and rejects it after removal', () => {
    const url = new URL(
      'https://buxx.me/static/aHR0cHM6Ly9jZG40LnRlbGVncmFtLWNkbi5vcmcvaW1hZ2UucG5n'
      + '?k=2026-06&e=1788134400&s=HqB348cmay5tSGcK7E3-5C5JyLwv5WTKc2J4LVT0C2I'
    );

    expect(verifyStaticProxyUrl(url, keyRing, { now: 1_788_134_399 })).toMatchObject({
      status: 'valid',
      keyId: '2026-06',
      targetUrl: 'https://cdn4.telegram-cdn.org/image.png',
    });
    expect(verifyStaticProxyUrl(url, { current: keyRing.current }, {
      now: 1_788_134_399,
    })).toEqual({
      status: 'invalid',
      targetUrl: 'https://cdn4.telegram-cdn.org/image.png',
      reason: 'unknown-key',
    });
  });

  test('reads current and optional previous keys from server runtime values', () => {
    expect(readStaticProxyKeyRing({
      env: {
        STATIC_PROXY_KEY_ID: '2026-07',
        STATIC_PROXY_SECRET: 'current-secret',
        STATIC_PROXY_PREVIOUS_KEY_ID: '2026-06',
        STATIC_PROXY_PREVIOUS_SECRET: 'previous-secret',
      },
    })).toEqual(keyRing);

    expect(readStaticProxyKeyRing({
      env: {
        STATIC_PROXY_KEY_ID: '2026-07',
        STATIC_PROXY_SECRET: 'current-secret',
      },
    })).toEqual({ current: keyRing.current });
  });
});
