import { describe, expect, test } from 'bun:test';
import {
  signedRequestPath,
  verifySignedRequestUrl,
} from '../../src/lib/security/signed-url';

describe('signed URL helpers', () => {
  test('creates a verifiable path with expiry and signature', () => {
    const path = signedRequestPath(
      '/api/activity-panel.svg',
      new URLSearchParams({ theme: 'dark' }),
      'secret',
      Math.floor(Date.now() / 1000) + 60,
    );

    const url = new URL(path, 'https://buxx.me');
    expect(url.searchParams.get('theme')).toBe('dark');
    expect(url.searchParams.has('exp')).toBe(true);
    expect(url.searchParams.has('sig')).toBe(true);
    expect(verifySignedRequestUrl(url, 'secret')).toBe(true);
  });

  test('rejects query changes after signing', () => {
    const path = signedRequestPath(
      '/api/activity-panel.svg',
      new URLSearchParams({ theme: 'dark' }),
      'secret',
      Math.floor(Date.now() / 1000) + 60,
    );

    const url = new URL(path, 'https://buxx.me');
    url.searchParams.set('theme', 'light');

    expect(verifySignedRequestUrl(url, 'secret')).toBe(false);
  });
});
