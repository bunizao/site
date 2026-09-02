import { describe, expect, test } from 'bun:test';
import { readTurnstileSiteKey } from '@/lib/turnstile-site-key';

describe('readTurnstileSiteKey', () => {
  test('prefers the staging build key over injected Wrangler runtime vars', () => {
    expect(readTurnstileSiteKey(
      { env: { PUBLIC_TURNSTILE_SITE_KEY: 'production-key' } },
      { PUBLIC_STAGING_TURNSTILE_SITE_KEY: 'staging-key' },
    )).toBe('staging-key');
  });

  test('uses the ordinary public key outside staging builds', () => {
    expect(readTurnstileSiteKey(
      { env: { PUBLIC_TURNSTILE_SITE_KEY: 'runtime-key' } },
      {},
    )).toBe('runtime-key');
  });
});
