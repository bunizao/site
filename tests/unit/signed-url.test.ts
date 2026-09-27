import { createHmac } from 'node:crypto';
import { describe, expect, test } from 'bun:test';
import { signedRequestPath } from '../../src/lib/security/signed-url';

describe('activity panel signing', () => {
  // The wire contract shared with site-api's verifier and the profile README
  // workflow: HMAC-SHA256 over the public path plus the sorted query, `sig` excluded.
  test('signs the public path and sorted query, expiry included', () => {
    const path = signedRequestPath('/api/activity-panel.svg', new URLSearchParams({ theme: 'dark', days: '7' }), 'secret', 1790000000);
    const url = new URL(path, 'https://buxx.me');
    const expected = createHmac('sha256', 'secret')
      .update('/api/activity-panel.svg?days=7&exp=1790000000&theme=dark')
      .digest('base64url');

    expect(url.pathname).toBe('/api/activity-panel.svg');
    expect(url.searchParams.get('exp')).toBe('1790000000');
    expect(url.searchParams.get('sig')).toBe(expected);
  });
});
