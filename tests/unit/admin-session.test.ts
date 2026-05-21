import { describe, expect, test } from 'bun:test';

import { readAdminDevSession } from '../../src/features/admin/server/session';

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
      100
    );

    expect(session?.login).toBe('bunizao');
  });
});
