import { defineMiddleware } from 'astro:middleware';
import {
  isAllowedEmail,
  readAdminAuthConfig,
  readAdminDevSession,
  readSessionFromCookieHeader,
  verifySessionToken,
} from '@/features/admin/server/session';
import { getDocsVisibilityFromContent } from '@/features/docs/server/content';
import { isDocsPath } from '@/features/docs/server/visibility';

const PORTAL_PREFIX = '/dev/portal';
const OAUTH_LOGIN_PATH = '/oauth/login';
const ADMIN_API_PREFIX = '/api/admin/';
const PUBLIC_ADMIN_API_PATHS = new Set<string>([
  '/api/admin/auth/start',
  '/api/admin/auth/callback',
  '/api/admin/auth/logout',
]);

function isPortalPath(pathname: string): boolean {
  return pathname === PORTAL_PREFIX || pathname.startsWith(`${PORTAL_PREFIX}/`);
}

function isProtectedAdminApi(pathname: string): boolean {
  if (!pathname.startsWith(ADMIN_API_PREFIX)) return false;
  return !PUBLIC_ADMIN_API_PATHS.has(pathname);
}

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);
  const pathname = url.pathname;

  const isPortal = isPortalPath(pathname);
  const docsVisibility = isDocsPath(pathname) ? await getDocsVisibilityFromContent(pathname) : 'missing';
  const isProtectedDocs = docsVisibility === 'protected';
  const isAdminApi = isProtectedAdminApi(pathname);
  if (!isPortal && !isProtectedDocs && !isAdminApi) {
    return next();
  }

  const config = readAdminAuthConfig(context.locals);
  const cookieHeader = context.request.headers.get('cookie');
  const token = readSessionFromCookieHeader(cookieHeader);
  const session = config.sessionSigningKey
    ? await verifySessionToken(token, config.sessionSigningKey)
    : null;
  const devSession = readAdminDevSession(context.locals, import.meta.env.DEV, url.hostname);
  const directDevSession = devSession && !isProtectedDocs ? devSession : null;
  const mutableLocals = context.locals as unknown as Record<string, unknown>;

  if (session) {
    if (
      isAllowedEmail(session.login, config.allowedEmail)
      || (devSession && isAllowedEmail(session.login, devSession.login))
    ) {
      mutableLocals.adminSession = {
        ...session,
        avatarUrl: session.avatarUrl || devSession?.avatarUrl,
      };
      return next();
    }
  }

  if (directDevSession) {
    mutableLocals.adminSession = directDevSession;
    return next();
  }

  if (isAdminApi) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  const next_ = encodeURIComponent(pathname + url.search);
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${OAUTH_LOGIN_PATH}?next=${next_}`,
    },
  });
});
