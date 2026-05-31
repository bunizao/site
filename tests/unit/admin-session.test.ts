import { describe, expect, test } from 'bun:test';

import {
  createOauthState,
  createSessionToken,
  readAdminDevSession,
  verifyOauthState,
  verifySessionToken,
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
      avatarUrl: 'https://github.com/tester.png?size=56',
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

  test('uses an explicit dev avatar when configured', () => {
    const session = readAdminDevSession(
      {
        env: {
          ADMIN_DEV_BYPASS: '1',
          ADMIN_DEV_LOGIN: 'tester',
          ADMIN_DEV_AVATAR_URL: 'https://avatars.example/tester.png',
        },
      },
      true,
      'localhost',
      100
    );

    expect(session?.avatarUrl).toBe('https://avatars.example/tester.png');
  });
});

describe('admin OAuth state', () => {
  test('signs session tokens with the configured key', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await createSessionToken('tester', 'test-signing-key', now);

    expect((await verifySessionToken(token, 'test-signing-key'))?.login).toBe('tester');
    expect(await verifySessionToken(token, 'other-signing-key')).toBeNull();
  });

  test('normalizes unsafe next paths back to the portal', async () => {
    const signingKey = 'test-signing-key';
    const now = Math.floor(Date.now() / 1000);
    const validState = await createOauthState(signingKey, '/dev/portal/subscribers', now);
    const docsState = await createOauthState(signingKey, '/docs/overview/architecture#runtime', now);
    const protocolRelativeState = await createOauthState(signingKey, '//evil.example/path', now);
    const absoluteUrlState = await createOauthState(signingKey, 'https://evil.example/path', now);

    expect((await verifyOauthState(validState, signingKey))?.next)
      .toBe('/dev/portal/subscribers');
    expect((await verifyOauthState(docsState, signingKey))?.next)
      .toBe('/docs/overview/architecture#runtime');
    expect((await verifyOauthState(protocolRelativeState, signingKey))?.next)
      .toBe('/dev/portal');
    expect((await verifyOauthState(absoluteUrlState, signingKey))?.next)
      .toBe('/dev/portal');
  });

  test('rejects OAuth state signed with another key', async () => {
    const now = Math.floor(Date.now() / 1000);
    const state = await createOauthState('test-signing-key', '/dev/portal/subscribers', now);

    expect(await verifyOauthState(state, 'other-signing-key')).toBeNull();
  });
});
