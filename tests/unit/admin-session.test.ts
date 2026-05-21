import { describe, expect, test } from 'bun:test';

import {
  createOauthState,
  readAdminDevSession,
  verifyOauthState,
} from '../../src/features/admin/server/session';

describe('admin dev session', () => {
  test('creates a local session only when dev bypass is enabled in dev mode', () => {
    const session = readAdminDevSession(
      {
        env: {
          ADMIN_DEV_BYPASS: '1',
          ADMIN_DEV_LOGIN: 'tester',
        },
      },
      true,
      'localhost',
      100
    );

    expect(session).toEqual({
      login: 'tester',
      iat: 100,
      exp: 604900,
    });
  });

  test('ignores the bypass outside dev mode', () => {
    const session = readAdminDevSession(
      {
        env: {
          ADMIN_DEV_BYPASS: '1',
          ADMIN_DEV_LOGIN: 'tester',
        },
      },
      false,
      'localhost',
      100
    );

    expect(session).toBeNull();
  });

  test('uses the allowed GitHub login when no dev login is configured', () => {
    const session = readAdminDevSession(
      {
        env: {
          ADMIN_DEV_BYPASS: '1',
          ADMIN_GITHUB_LOGIN: 'bunizao',
        },
      },
      true,
      'localhost',
      100
    );

    expect(session?.login).toBe('bunizao');
  });

  test('rejects the bypass on non-local hosts', () => {
    const session = readAdminDevSession(
      {
        env: {
          ADMIN_DEV_BYPASS: '1',
          ADMIN_DEV_LOGIN: 'tester',
        },
      },
      true,
      '192.168.1.20',
      100
    );

    expect(session).toBeNull();
  });

  test('accepts loopback hosts only', () => {
    const locals = {
      env: {
        ADMIN_DEV_BYPASS: '1',
      },
    };

    expect(readAdminDevSession(locals, true, '127.0.0.1', 100)?.login).toBe('local-dev');
    expect(readAdminDevSession(locals, true, '[::1]', 100)?.login).toBe('local-dev');
  });
});

describe('admin OAuth state', () => {
  test('normalizes unsafe next paths back to the portal', () => {
    const signingKey = 'test-signing-key';
    const now = Math.floor(Date.now() / 1000);

    expect(verifyOauthState(createOauthState(signingKey, '/dev/portal/subscribers', now), signingKey)?.next)
      .toBe('/dev/portal/subscribers');
    expect(verifyOauthState(createOauthState(signingKey, '//evil.example/path', now), signingKey)?.next)
      .toBe('/dev/portal');
    expect(verifyOauthState(createOauthState(signingKey, 'https://evil.example/path', now), signingKey)?.next)
      .toBe('/dev/portal');
  });
});
