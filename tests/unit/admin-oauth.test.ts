import { describe, expect, test } from 'bun:test';

import { buildOauthStartResult } from '../../src/features/admin/server/oauth';
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_OAUTH_STATE_COOKIE,
  readSessionFromCookieHeader,
  verifySessionToken,
} from '../../src/features/admin/server/session';

describe('admin OAuth start', () => {
  test('mints a local session cookie for loopback dev login', async () => {
    const result = await buildOauthStartResult(
      new Request('http://localhost:4321/api/admin/auth/start?next=/dev/portal/newsletter'),
      {
        env: {
          ADMIN_DEV_BYPASS: '1',
          ADMIN_DEV_LOGIN: 'tester',
          ADMIN_SESSION_SECRET: 'test-secret',
        },
      },
      '/dev/portal/newsletter',
      true
    );

    expect(result?.redirectUrl).toBe('/dev/portal/newsletter');
    expect(result?.cookies[0]).toContain(`${ADMIN_SESSION_COOKIE}=`);
    const token = readSessionFromCookieHeader(result?.cookies[0]);
    const session = await verifySessionToken(token, 'test-secret');
    expect(session?.avatarUrl).toBe('https://github.com/tester.png?size=56');
  });

  test('falls back to GitHub OAuth outside dev bypass', async () => {
    const result = await buildOauthStartResult(
      new Request('https://buxx.me/api/admin/auth/start?next=/dev/portal'),
      {
        env: {
          GITHUB_OAUTH_CLIENT_ID: 'client-id',
          ADMIN_SESSION_SECRET: 'test-secret',
        },
      },
      '/dev/portal',
      false
    );

    expect(result?.redirectUrl).toStartWith('https://github.com/login/oauth/authorize?');
    expect(result?.cookies[0]).toContain(`${ADMIN_OAUTH_STATE_COOKIE}=`);
  });

  test('does not mint a dev session for non-loopback hosts', async () => {
    const result = await buildOauthStartResult(
      new Request('http://192.168.1.20:4321/api/admin/auth/start?next=/dev/portal'),
      {
        env: {
          ADMIN_DEV_BYPASS: '1',
          ADMIN_DEV_LOGIN: 'tester',
          ADMIN_SESSION_SECRET: 'test-secret',
        },
      },
      '/dev/portal',
      true
    );

    expect(result).toBeNull();
  });
});
