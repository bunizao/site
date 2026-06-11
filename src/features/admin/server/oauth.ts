import {
  buildSessionCookie,
  buildStateCookie,
  buildClearStateCookie,
  createOauthState,
  createSessionToken,
  isAllowedEmail,
  readAdminAuthConfig,
  readAdminDevSession,
  verifyOauthState,
} from './session';

const CLOUDFLARE_AUTHORIZE_URL = 'https://dash.cloudflare.com/oauth2/auth';
const CLOUDFLARE_TOKEN_URL = 'https://dash.cloudflare.com/oauth2/token';
const CLOUDFLARE_USER_URL = 'https://api.cloudflare.com/client/v4/user';
const DEFAULT_ADMIN_NEXT_PATH = '/dev/portal';
const DOCS_NEXT_PATH = '/docs';

interface CloudflareTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
  scope?: string;
  id_token?: string;
  token_type?: string;
}

interface CloudflareUserInfoResponse {
  success?: boolean;
  result?: {
    id?: string;
    email?: string;
    first_name?: string;
    last_name?: string;
    username?: string;
  };
}

export function getRedirectUri(request: Request): string {
  const url = new URL(request.url);
  return `${url.origin}/api/admin/auth/callback`;
}

export function buildAuthorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: 'user:read',
  });
  return `${CLOUDFLARE_AUTHORIZE_URL}?${params.toString()}`;
}

function normalizeStartRedirectPath(value: string): string {
  const trimmed = value.trim() || DEFAULT_ADMIN_NEXT_PATH;
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\')) {
    return DEFAULT_ADMIN_NEXT_PATH;
  }

  try {
    const url = new URL(trimmed, 'https://buxx.me');
    const next = `${url.pathname}${url.search}${url.hash}`;
    if (next === DEFAULT_ADMIN_NEXT_PATH || next.startsWith(`${DEFAULT_ADMIN_NEXT_PATH}/`)) {
      return next;
    }
    if (next === DOCS_NEXT_PATH || next.startsWith(`${DOCS_NEXT_PATH}/`)) {
      return next;
    }
  } catch {
    return DEFAULT_ADMIN_NEXT_PATH;
  }

  return DEFAULT_ADMIN_NEXT_PATH;
}

export interface OauthStartResult {
  redirectUrl: string;
  cookies: string[];
}

export async function buildOauthStartResult(
  request: Request,
  locals: any,
  nextPath: string,
  isDev = false
): Promise<OauthStartResult | null> {
  const config = readAdminAuthConfig(locals);
  const url = new URL(request.url);

  const devSession = readAdminDevSession(locals, isDev, url.hostname);
  if (devSession && config.sessionSigningKey) {
    const sessionToken = await createSessionToken(devSession.login, config.sessionSigningKey, undefined, {
      avatarUrl: devSession.avatarUrl,
    });
    return {
      redirectUrl: normalizeStartRedirectPath(nextPath),
      cookies: [buildSessionCookie(sessionToken)],
    };
  }

  if (!config.clientId || !config.sessionSigningKey) return null;

  const stateToken = await createOauthState(config.sessionSigningKey, nextPath);
  return {
    redirectUrl: buildAuthorizeUrl(config.clientId, getRedirectUri(request), stateToken),
    cookies: [buildStateCookie(stateToken)],
  };
}

export interface OauthCallbackOk {
  ok: true;
  redirectTo: string;
  cookies: string[];
}

export interface OauthCallbackError {
  ok: false;
  reason: 'state' | 'forbidden' | 'token' | 'user' | 'config';
  cookies: string[];
}

export type OauthCallbackResult = OauthCallbackOk | OauthCallbackError;

export async function handleOauthCallback(request: Request, locals: any): Promise<OauthCallbackResult> {
  const config = readAdminAuthConfig(locals);
  const cookies = [buildClearStateCookie()];

  if (!config.clientId || !config.clientSecret || !config.allowedEmail || !config.sessionSigningKey) {
    return { ok: false, reason: 'config', cookies };
  }

  const url = new URL(request.url);
  const oauthError = url.searchParams.get('error')?.trim();
  const code = url.searchParams.get('code')?.trim();
  const incomingState = url.searchParams.get('state')?.trim();
  if (oauthError) {
    return { ok: false, reason: 'token', cookies };
  }
  if (!code || !incomingState) {
    return { ok: false, reason: 'state', cookies };
  }

  const verified = await verifyOauthState(incomingState, config.sessionSigningKey);
  if (!verified) {
    return { ok: false, reason: 'state', cookies };
  }

  let tokenPayload: CloudflareTokenResponse;
  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: getRedirectUri(request),
    });
    const tokenResponse = await fetch(CLOUDFLARE_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
    if (!tokenResponse.ok) {
      return { ok: false, reason: 'token', cookies };
    }
    tokenPayload = (await tokenResponse.json()) as CloudflareTokenResponse;
  } catch {
    return { ok: false, reason: 'token', cookies };
  }

  const accessToken = tokenPayload.access_token?.trim();
  if (!accessToken) {
    return { ok: false, reason: 'token', cookies };
  }

  let user: CloudflareUserInfoResponse;
  try {
    const userResponse = await fetch(CLOUDFLARE_USER_URL, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!userResponse.ok) {
      return { ok: false, reason: 'user', cookies };
    }
    user = (await userResponse.json()) as CloudflareUserInfoResponse;
  } catch {
    return { ok: false, reason: 'user', cookies };
  }

  const email = user.result?.email?.trim() ?? '';
  if (!isAllowedEmail(email, config.allowedEmail)) {
    return { ok: false, reason: 'forbidden', cookies };
  }

  const sessionToken = await createSessionToken(email, config.sessionSigningKey);
  cookies.push(buildSessionCookie(sessionToken));
  return { ok: true, redirectTo: verified.next, cookies };
}
