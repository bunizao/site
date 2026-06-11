import { describe, expect, test } from 'bun:test';

import { buildOauthStartResult, handleOauthCallback } from '../../src/features/admin/server/oauth';
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_OAUTH_STATE_COOKIE,
  createOauthState,
  readSessionFromCookieHeader,
  readStateFromCookieHeader,
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

  test('preserves docs redirects through dev login', async () => {
    const result = await buildOauthStartResult(
      new Request('http://localhost:4321/api/admin/auth/start?next=/docs/overview/architecture'),
      {
        env: {
          ADMIN_DEV_BYPASS: '1',
          ADMIN_DEV_LOGIN: 'tester',
          ADMIN_SESSION_SECRET: 'test-secret',
        },
      },
      '/docs/overview/architecture',
      true
    );

    expect(result?.redirectUrl).toBe('/docs/overview/architecture');
  });

  test('starts GitHub OAuth outside dev bypass', async () => {
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
    expect(result?.redirectUrl).toContain('scope=read%3Auser');
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

describe('admin OAuth callback', () => {
  test('mints a session for the allowed GitHub login', async () => {
    const originalFetch = globalThis.fetch;
    const state = await createOauthState('test-secret', '/dev/portal/subscribers');
    const requests: string[] = [];

    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input);
      requests.push(url);

      if (url === 'https://github.com/login/oauth/access_token') {
        expect(init?.method).toBe('POST');
        return new Response(JSON.stringify({ access_token: 'access-token', token_type: 'Bearer' }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'https://api.github.com/user') {
        expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer access-token');
        return new Response(JSON.stringify({
          login: 'admin-login',
          avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4',
        }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response('unexpected request', { status: 500 });
    }) as typeof fetch;

    try {
      const stateCookie = `${ADMIN_OAUTH_STATE_COOKIE}=${state}`;
      const result = await handleOauthCallback(
        new Request(
          `https://buxx.me/api/admin/auth/callback?code=oauth-code&state=${encodeURIComponent(state)}`,
          { headers: { cookie: stateCookie } }
        ),
        {
          env: {
            GITHUB_OAUTH_CLIENT_ID: 'client-id',
            GITHUB_OAUTH_CLIENT_SECRET: 'client-secret',
            ADMIN_GITHUB_LOGIN: 'admin-login',
            ADMIN_SESSION_SECRET: 'test-secret',
          },
        }
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.redirectTo).toBe('/dev/portal/subscribers');
      expect(requests).toEqual([
        'https://github.com/login/oauth/access_token',
        'https://api.github.com/user',
      ]);
      expect(readStateFromCookieHeader(result.cookies[0])).toBe('');
      const sessionCookie = result.cookies.find((cookie) => cookie.startsWith(`${ADMIN_SESSION_COOKIE}=`));
      const token = readSessionFromCookieHeader(sessionCookie);
      const session = await verifySessionToken(token, 'test-secret');
      expect(session?.login).toBe('admin-login');
      expect(session?.avatarUrl).toBe('https://avatars.githubusercontent.com/u/1?v=4');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
