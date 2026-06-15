import { defineMiddleware } from 'astro:middleware';
import {
  createApiServiceRequest,
  getApiServiceBinding,
} from '@/lib/http/api-service-proxy';
import type { RuntimeEnvLocals } from '@/lib/runtime/env';
import { getDocsVisibilityFromContent } from '@/features/docs/server/content';
import { isDocsPath } from '@/features/docs/server/visibility';
import {
  readAdminDevBypassSession,
  type AdminSessionIdentity,
} from '@/features/admin/server/dev-bypass';

const OAUTH_LOGIN_PATH = '/oauth/login';
const DEV_PORTAL_PREFIX = '/dev';

function isDevPortalPath(pathname: string): boolean {
  return pathname === DEV_PORTAL_PREFIX || pathname.startsWith(`${DEV_PORTAL_PREFIX}/`);
}

export function createHtmlScriptCsp(origin: string): string {
  const cleanOrigin = origin.replace(/\/+$/, '');
  return [
    `script-src 'unsafe-inline' ${cleanOrigin}/_astro/ https://challenges.cloudflare.com http://localhost:* http://127.0.0.1:*`,
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; ');
}

function withHtmlSecurityHeaders(request: Request, response: Response): Response {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('text/html')) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy', createHtmlScriptCsp(new URL(request.url).origin));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Reads the admin identity from the private worker. site-api validates the
// signed session cookie and returns the login (or 401 when unauthenticated).
async function fetchAdminSession(
  request: Request,
  locals: RuntimeEnvLocals | undefined,
): Promise<AdminSessionIdentity | null> {
  const api = await getApiServiceBinding(locals);
  if (!api) return null;

  const url = new URL(request.url);
  url.pathname = '/v2/admin/session';
  url.search = '';

  const headers = new Headers();
  const cookie = request.headers.get('cookie');
  if (cookie) {
    headers.set('cookie', cookie);
  }

  const response = await api.fetch(createApiServiceRequest(new Request(url, {
    method: 'GET',
    headers,
  })));
  if (!response.ok) return null;

  try {
    const data = (await response.json()) as Partial<AdminSessionIdentity>;
    if (!data?.login) return null;
    return { login: data.login, avatarUrl: data.avatarUrl };
  } catch {
    return null;
  }
}

function redirectToLogin(pathname: string, search: string): Response {
  const nextPath = encodeURIComponent(pathname + search);
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${OAUTH_LOGIN_PATH}?next=${nextPath}`,
    },
  });
}

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);
  const pathname = url.pathname;

  // Admin portal: served by this worker, gated on the private admin session.
  if (isDevPortalPath(pathname)) {
    const session = readAdminDevBypassSession(context.locals, url.hostname)
      ?? await fetchAdminSession(context.request, context.locals);
    if (!session) {
      return redirectToLogin(pathname, url.search);
    }
    (context.locals as unknown as Record<string, unknown>).adminSession = session;
    return withHtmlSecurityHeaders(context.request, await next());
  }

  const docsVisibility = isDocsPath(pathname) ? await getDocsVisibilityFromContent(pathname) : 'missing';

  if (docsVisibility !== 'protected') {
    return withHtmlSecurityHeaders(context.request, await next());
  }

  if (await fetchAdminSession(context.request, context.locals)) {
    return withHtmlSecurityHeaders(context.request, await next());
  }

  return redirectToLogin(pathname, url.search);
});
