import {
  buildSessionCookie,
  buildStateCookie,
  buildClearStateCookie,
  createOauthState,
  createSessionToken,
  isAllowedLogin,
  readAdminAuthConfig,
  readAdminDevSession,
  readStateFromCookieHeader,
  verifyOauthState,
} from './session';

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';
const DEFAULT_ADMIN_NEXT_PATH = '/dev/portal';

interface GithubTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
  scope?: string;
  token_type?: string;
}

interface GithubUserResponse {
  login?: string;
  id?: number;
  avatar_url?: string;
  name?: string;
}

export function getRedirectUri(request: Request): string {
  const url = new URL(request.url);
  return `${url.origin}/api/admin/auth/callback`;
}

export function buildAuthorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: 'read:user',
    allow_signup: 'false',
  });
  return `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;
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
  } catch {
    return DEFAULT_ADMIN_NEXT_PATH;
  }

  return DEFAULT_ADMIN_NEXT_PATH;
}

export interface OauthStartResult {
  redirectUrl: string;
  cookies: string[];
}

export function buildOauthStartResult(
  request: Request,
  locals: any,
  nextPath: string,
  isDev = false
): OauthStartResult | null {
  const config = readAdminAuthConfig(locals);
  const url = new URL(request.url);

  const devSession = readAdminDevSession(locals, isDev, url.hostname);
  if (devSession && config.sessionSigningKey) {
    const sessionToken = createSessionToken(devSession.login, config.sessionSigningKey);
    return {
      redirectUrl: normalizeStartRedirectPath(nextPath),
      cookies: [buildSessionCookie(sessionToken)],
    };
  }

  if (!config.clientId || !config.sessionSigningKey) return null;

  const stateToken = createOauthState(config.sessionSigningKey, nextPath);
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

  if (!config.clientId || !config.clientSecret || !config.allowedLogin || !config.sessionSigningKey) {
    return { ok: false, reason: 'config', cookies };
  }

  const url = new URL(request.url);
  const code = url.searchParams.get('code')?.trim();
  const incomingState = url.searchParams.get('state')?.trim();
  if (!code || !incomingState) {
    return { ok: false, reason: 'state', cookies };
  }

  const cookieHeader = request.headers.get('cookie');
  const storedState = readStateFromCookieHeader(cookieHeader);
  if (!storedState || storedState !== incomingState) {
    return { ok: false, reason: 'state', cookies };
  }

  const verified = verifyOauthState(storedState, config.sessionSigningKey);
  if (!verified) {
    return { ok: false, reason: 'state', cookies };
  }

  let tokenPayload: GithubTokenResponse;
  try {
    const tokenResponse = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: getRedirectUri(request),
      }),
    });
    if (!tokenResponse.ok) {
      return { ok: false, reason: 'token', cookies };
    }
    tokenPayload = (await tokenResponse.json()) as GithubTokenResponse;
  } catch {
    return { ok: false, reason: 'token', cookies };
  }

  const accessToken = tokenPayload.access_token?.trim();
  if (!accessToken) {
    return { ok: false, reason: 'token', cookies };
  }

  let user: GithubUserResponse;
  try {
    const userResponse = await fetch(GITHUB_USER_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'buxx-dev-portal',
      },
    });
    if (!userResponse.ok) {
      return { ok: false, reason: 'user', cookies };
    }
    user = (await userResponse.json()) as GithubUserResponse;
  } catch {
    return { ok: false, reason: 'user', cookies };
  }

  const login = user.login?.trim() ?? '';
  if (!isAllowedLogin(login, config.allowedLogin)) {
    return { ok: false, reason: 'forbidden', cookies };
  }

  const sessionToken = createSessionToken(login, config.sessionSigningKey);
  cookies.push(buildSessionCookie(sessionToken));
  return { ok: true, redirectTo: verified.next, cookies };
}
