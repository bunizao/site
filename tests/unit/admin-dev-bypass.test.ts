import { describe, expect, test } from 'bun:test';

import { readAdminDevBypassSession } from '../../src/features/admin/server/dev-bypass';

const bypassEnv = { env: { ADMIN_DEV_BYPASS: '1', ADMIN_DEV_LOGIN: 'local-admin' } };

describe('admin dev bypass', () => {
  test('creates a local admin session when the bypass is enabled', () => {
    const session = readAdminDevBypassSession({
      env: {
        ADMIN_DEV_BYPASS: '1',
        ADMIN_DEV_LOGIN: 'local-admin',
        ADMIN_DEV_AVATAR_URL: 'https://example.com/avatar.png',
      },
    }, new Request('http://localhost:4321/dev/portal'));

    expect(session).toEqual({
      login: 'local-admin',
      avatarUrl: 'https://example.com/avatar.png',
    });
  });

  test('accepts every loopback hostname, including bracketed IPv6', () => {
    for (const origin of ['http://127.0.0.1:4321', 'http://[::1]:4321']) {
      expect(readAdminDevBypassSession(bypassEnv, new Request(`${origin}/dev/portal`)))
        .toEqual({ login: 'local-admin' });
    }
  });

  test('does not enable the bypass on production hosts', () => {
    const session = readAdminDevBypassSession(bypassEnv, new Request('https://buxx.me/dev/portal'));

    expect(session).toBeNull();
  });

  test('refuses a localhost request that arrived through a Cloudflare tunnel', () => {
    for (const header of ['cf-ray', 'cf-connecting-ip']) {
      const request = new Request('http://localhost:4321/dev/portal', {
        headers: { [header]: 'tunnel' },
      });

      expect(readAdminDevBypassSession(bypassEnv, request)).toBeNull();
    }
  });

  test('keeps the portal gated when the bypass flag is missing', () => {
    const session = readAdminDevBypassSession({
      env: {
        ADMIN_DEV_LOGIN: 'local-admin',
      },
    }, new Request('http://localhost:4321/dev/portal'));

    expect(session).toBeNull();
  });
});
