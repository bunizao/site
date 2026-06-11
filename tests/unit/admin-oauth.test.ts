import { describe, expect, test } from 'bun:test';

import { buildOauthStartResult, handleOauthCallback } from '../../src/features/admin/server/oauth';
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_OAUTH_STATE_COOKIE,
  createOauthState,
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
    expect(session?.avatarUrl).toBeUndefined();
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

  test('starts Cloudflare OAuth outside dev bypass', async () => {
    const result = await buildOauthStartResult(
      new Request('https://buxx.me/api/admin/auth/start?next=/dev/portal'),
      {
        env: {
          CLOUDFLARE_OAUTH_CLIENT_ID: 'client-id',
          ADMIN_SESSION_SECRET: 'test-secret',
        },
      },
      '/dev/portal',
      false
    );

    expect(result?.redirectUrl).toStartWith('https://dash.cloudflare.com/oauth2/auth?');
    expect(result?.redirectUrl).toContain('scope=user%3Aread');
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
  test('mints a session for the allowed Cloudflare email', async () => {
    const originalFetch = globalThis.fetch;
    const state = await createOauthState('test-secret', '/dev/portal/subscribers');
    const requests: string[] = [];

    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input);
      requests.push(url);

      if (url === 'https://dash.cloudflare.com/oauth2/token') {
        expect(init?.method).toBe('POST');
        expect(String(init?.body)).toContain('grant_type=authorization_code');
        return new Response(JSON.stringify({ access_token: 'access-token', token_type: 'Bearer' }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'https://api.cloudflare.com/client/v4/user') {
        expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer access-token');
        return new Response(JSON.stringify({
          success: true,
          result: {
            email: 'admin@example.com',
          },
        }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response('unexpected request', { status: 500 });
    }) as typeof fetch;

    try {
      const result = await handleOauthCallback(
        new Request(`https://buxx.me/api/admin/auth/callback?code=oauth-code&state=${encodeURIComponent(state)}`),
        {
          env: {
            CLOUDFLARE_OAUTH_CLIENT_ID: 'client-id',
            CLOUDFLARE_OAUTH_CLIENT_SECRET: 'client-secret',
            ADMIN_CLOUDFLARE_EMAIL: 'admin@example.com',
            ADMIN_SESSION_SECRET: 'test-secret',
          },
        }
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.redirectTo).toBe('/dev/portal/subscribers');
      expect(requests).toEqual([
        'https://dash.cloudflare.com/oauth2/token',
        'https://api.cloudflare.com/client/v4/user',
      ]);
      const sessionCookie = result.cookies.find((cookie) => cookie.startsWith(`${ADMIN_SESSION_COOKIE}=`));
      const token = readSessionFromCookieHeader(sessionCookie);
      const session = await verifySessionToken(token, 'test-secret');
      expect(session?.login).toBe('admin@example.com');
      expect(session?.avatarUrl).toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
