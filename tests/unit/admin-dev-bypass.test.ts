import { describe, expect, test } from 'bun:test';

import { readAdminDevBypassSession } from '../../src/features/admin/server/dev-bypass';

describe('admin dev bypass', () => {
  test('creates a local admin session when the bypass is enabled', () => {
    const session = readAdminDevBypassSession({
      env: {
        ADMIN_DEV_BYPASS: '1',
        ADMIN_DEV_LOGIN: 'local-admin',
        ADMIN_DEV_AVATAR_URL: 'https://example.com/avatar.png',
      },
    }, 'localhost');

    expect(session).toEqual({
      login: 'local-admin',
      avatarUrl: 'https://example.com/avatar.png',
    });
  });

  test('does not enable the bypass on production hosts', () => {
    const session = readAdminDevBypassSession({
      env: {
        ADMIN_DEV_BYPASS: '1',
        ADMIN_DEV_LOGIN: 'local-admin',
      },
    }, 'buxx.me');

    expect(session).toBeNull();
  });

  test('keeps the portal gated when the bypass flag is missing', () => {
    const session = readAdminDevBypassSession({
      env: {
        ADMIN_DEV_LOGIN: 'local-admin',
      },
    }, 'localhost');

    expect(session).toBeNull();
  });
});
