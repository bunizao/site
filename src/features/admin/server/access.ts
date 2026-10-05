import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';
import { readOptionalEnv, type RuntimeEnvLocals } from '@/lib/runtime/env';
import type { AdminSessionIdentity } from './dev-bypass';

const ACCESS_JWT_HEADER = 'cf-access-jwt-assertion';
const ACCESS_JWT_COOKIE = 'CF_Authorization';

const jwksByTeamDomain = new Map<string, JWTVerifyGetKey>();

export interface CloudflareAccessConfig {
  teamDomain: string;
  audiences: string[];
  allowedEmails: string[];
}

export interface CloudflareAccessOptions {
  keyResolver?: JWTVerifyGetKey;
}

function splitList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeTeamDomain(value: string | undefined): string {
  const clean = (value ?? '')
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');

  if (!clean) return '';
  return clean.endsWith('.cloudflareaccess.com') ? clean : `${clean}.cloudflareaccess.com`;
}

export function readCloudflareAccessConfig(
  locals: RuntimeEnvLocals | undefined,
): CloudflareAccessConfig | null {
  const teamDomain = normalizeTeamDomain(readOptionalEnv(locals, 'CLOUDFLARE_ACCESS_TEAM_DOMAIN'));
  const audiences = [
    ...splitList(readOptionalEnv(locals, 'CLOUDFLARE_ACCESS_AUD')),
    ...splitList(readOptionalEnv(locals, 'CLOUDFLARE_ACCESS_AUDS')),
  ];

  if (!teamDomain || audiences.length === 0) return null;

  return {
    teamDomain,
    audiences: [...new Set(audiences)],
    allowedEmails: splitList(readOptionalEnv(locals, 'CLOUDFLARE_ACCESS_ALLOWED_EMAILS'))
      .map((email) => email.toLowerCase()),
  };
}

function cloudflareAccessJwks(teamDomain: string): JWTVerifyGetKey {
  const cached = jwksByTeamDomain.get(teamDomain);
  if (cached) return cached;

  const jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
  jwksByTeamDomain.set(teamDomain, jwks);
  return jwks;
}

function identityFromPayload(
  payload: JWTPayload,
  allowedEmails: string[],
): AdminSessionIdentity | null {
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  if (!email) return null;
  if (allowedEmails.length > 0 && !allowedEmails.includes(email)) return null;

  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  const login = name || email.split('@')[0] || email;

  return {
    login,
    email,
  };
}

// Access adds the header only on paths its application covers (/dev*). The
// cookie it sets at sign-in carries the same token to the rest of the host, so a
// page outside that path, such as a locked docs page, can still tell the owner
// apart. Both go through the same verification.
function readAccessToken(request: Request): string | null {
  const header = request.headers.get(ACCESS_JWT_HEADER)?.trim();
  if (header) return header;

  for (const pair of request.headers.get('cookie')?.split(';') ?? []) {
    const [name, ...value] = pair.trim().split('=');
    if (name === ACCESS_JWT_COOKIE) return value.join('=').trim() || null;
  }
  return null;
}

export async function readCloudflareAccessIdentity(
  request: Request,
  locals: RuntimeEnvLocals | undefined,
  options: CloudflareAccessOptions = {},
): Promise<AdminSessionIdentity | null> {
  const config = readCloudflareAccessConfig(locals);
  if (!config) return null;

  const token = readAccessToken(request);
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(
      token,
      options.keyResolver ?? cloudflareAccessJwks(config.teamDomain),
      {
        issuer: `https://${config.teamDomain}`,
        audience: config.audiences,
      },
    );

    return identityFromPayload(payload, config.allowedEmails);
  } catch {
    return null;
  }
}
