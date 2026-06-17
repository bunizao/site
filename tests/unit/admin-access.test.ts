import { describe, expect, test } from 'bun:test';
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
} from 'jose';

import { readCloudflareAccessIdentity } from '../../src/features/admin/server/access';

async function createAccessToken(payload: Record<string, unknown> = {}) {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  const kid = 'test-key';
  const keyResolver = createLocalJWKSet({
    keys: [{ ...publicJwk, kid, alg: 'RS256' }],
  });
  const token = await new SignJWT({
    email: 'owner@example.com',
    name: 'Owner',
    ...payload,
  })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer('https://team.cloudflareaccess.com')
    .setAudience('admin-aud')
    .setExpirationTime('5m')
    .sign(privateKey);

  return { token, keyResolver };
}

describe('Cloudflare Access admin auth', () => {
  test('reads an admin identity from a valid Access JWT', async () => {
    const { token, keyResolver } = await createAccessToken();
    const identity = await readCloudflareAccessIdentity(
      new Request('https://buxx.me/dev/portal', {
        headers: {
          'Cf-Access-Jwt-Assertion': token,
        },
      }),
      {
        env: {
          CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
          CLOUDFLARE_ACCESS_AUD: 'admin-aud',
          CLOUDFLARE_ACCESS_ALLOWED_EMAILS: 'owner@example.com',
        },
      },
      { keyResolver },
    );

    expect(identity).toEqual({
      login: 'Owner',
      email: 'owner@example.com',
    });
  });

  test('rejects Access identities outside the allowed email list', async () => {
    const { token, keyResolver } = await createAccessToken();
    const identity = await readCloudflareAccessIdentity(
      new Request('https://buxx.me/dev/portal', {
        headers: {
          'Cf-Access-Jwt-Assertion': token,
        },
      }),
      {
        env: {
          CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
          CLOUDFLARE_ACCESS_AUD: 'admin-aud',
          CLOUDFLARE_ACCESS_ALLOWED_EMAILS: 'someone@example.com',
        },
      },
      { keyResolver },
    );

    expect(identity).toBeNull();
  });

  test('accepts a token matching one configured Access audience', async () => {
    const { token, keyResolver } = await createAccessToken();
    const identity = await readCloudflareAccessIdentity(
      new Request('https://buxx.me/dev/portal', {
        headers: {
          'Cf-Access-Jwt-Assertion': token,
        },
      }),
      {
        env: {
          CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
          CLOUDFLARE_ACCESS_AUDS: 'other-aud, admin-aud',
          CLOUDFLARE_ACCESS_ALLOWED_EMAILS: 'owner@example.com',
        },
      },
      { keyResolver },
    );

    expect(identity?.email).toBe('owner@example.com');
  });

  test('fails closed when Access configuration is missing', async () => {
    const { token, keyResolver } = await createAccessToken();
    const identity = await readCloudflareAccessIdentity(
      new Request('https://buxx.me/dev/portal', {
        headers: {
          'Cf-Access-Jwt-Assertion': token,
        },
      }),
      { env: {} },
      { keyResolver },
    );

    expect(identity).toBeNull();
  });
});
