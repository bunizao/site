import { beforeAll, describe, expect, test } from 'bun:test';
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
  type JWTVerifyGetKey,
} from 'jose';

import { readCloudflareAccessIdentity } from '../../src/features/admin/server/access';

const KID = 'test-key';
const ACCESS_ENV = {
  CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
  CLOUDFLARE_ACCESS_AUD: 'admin-aud',
  CLOUDFLARE_ACCESS_ALLOWED_EMAILS: 'owner@example.com',
};

// RSA key generation dominates this file's runtime, so one pair signs every token.
let privateKey: CryptoKey;
let keyResolver: JWTVerifyGetKey;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  const publicJwk = await exportJWK(pair.publicKey);
  keyResolver = createLocalJWKSet({ keys: [{ ...publicJwk, kid: KID, alg: 'RS256' }] });
});

function signAccessToken(overrides: { issuer?: string; audience?: string; expiresAt?: string | number } = {}) {
  return new SignJWT({ email: 'owner@example.com', name: 'Owner' })
    .setProtectedHeader({ alg: 'RS256', kid: KID })
    .setIssuer(overrides.issuer ?? 'https://team.cloudflareaccess.com')
    .setAudience(overrides.audience ?? 'admin-aud')
    .setExpirationTime(overrides.expiresAt ?? '5m')
    .sign(privateKey);
}

function readIdentity(token: string, env: Record<string, string> = ACCESS_ENV) {
  return readCloudflareAccessIdentity(
    new Request('https://buxx.me/dev/portal', {
      headers: { 'Cf-Access-Jwt-Assertion': token },
    }),
    { env },
    { keyResolver },
  );
}

// Outside the Access application's path only the sign-in cookie arrives.
function readCookieIdentity(cookie: string) {
  return readCloudflareAccessIdentity(
    new Request('https://buxx.me/docs/api/endpoints', { headers: { Cookie: cookie } }),
    { env: ACCESS_ENV },
    { keyResolver },
  );
}

describe('Access JWT gate', () => {
  test('reads an admin identity from a valid Access JWT', async () => {
    expect(await readIdentity(await signAccessToken())).toEqual({
      login: 'Owner',
      email: 'owner@example.com',
    });
  });

  test('rejects Access identities outside the allowed email list', async () => {
    const identity = await readIdentity(await signAccessToken(), {
      ...ACCESS_ENV,
      CLOUDFLARE_ACCESS_ALLOWED_EMAILS: 'someone@example.com',
    });

    expect(identity).toBeNull();
  });

  test('accepts a token matching one configured Access audience', async () => {
    const { CLOUDFLARE_ACCESS_AUD: _aud, ...env } = ACCESS_ENV;
    const identity = await readIdentity(await signAccessToken(), {
      ...env,
      CLOUDFLARE_ACCESS_AUDS: 'other-aud, admin-aud',
    });

    expect(identity?.email).toBe('owner@example.com');
  });

  // A token Access minted for another application, another team, or one that
  // has expired must never open the portal, even with an allowed email.
  test('rejects a token issued for another Access application', async () => {
    expect(await readIdentity(await signAccessToken({ audience: 'other-app-aud' }))).toBeNull();
  });

  test('rejects a token issued by another Access team', async () => {
    expect(await readIdentity(await signAccessToken({ issuer: 'https://other-team.cloudflareaccess.com' }))).toBeNull();
  });

  test('rejects an expired token', async () => {
    const expiredAt = Math.floor(Date.now() / 1000) - 60;
    expect(await readIdentity(await signAccessToken({ expiresAt: expiredAt }))).toBeNull();
  });

  test('fails closed when Access configuration is missing', async () => {
    expect(await readIdentity(await signAccessToken(), {})).toBeNull();
  });

  test('reads the identity from the Access cookie when the header is absent', async () => {
    const identity = await readCookieIdentity(`theme=dark; CF_Authorization=${await signAccessToken()}`);
    expect(identity?.email).toBe('owner@example.com');
  });

  test('verifies a cookie token like a header token', async () => {
    expect(await readCookieIdentity(`CF_Authorization=${await signAccessToken({ audience: 'other-app-aud' })}`))
      .toBeNull();
    expect(await readCookieIdentity('CF_Authorization=not-a-jwt')).toBeNull();
    expect(await readCookieIdentity('CF_Authorization=')).toBeNull();
  });
});
