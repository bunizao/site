import { defineMiddleware } from 'astro:middleware';
import { getDocsVisibilityFromContent } from '@/features/docs/server/content';
import { isDocsPath } from '@/features/docs/server/visibility';
import { readCloudflareAccessIdentity } from '@/features/admin/server/access';
import type { RuntimeEnvLocals } from '@/lib/runtime/env';
import {
  readAdminDevBypassSession,
  type AdminSessionIdentity,
} from '@/features/admin/server/dev-bypass';

const DEV_PORTAL_PREFIX = '/dev';

function isDevPortalPath(pathname: string): boolean {
  return pathname === DEV_PORTAL_PREFIX || pathname.startsWith(`${DEV_PORTAL_PREFIX}/`);
}

function isMoodPath(pathname: string): boolean {
  return pathname === '/mood' || pathname.startsWith('/mood/');
}

export function createHtmlScriptCsp(origin: string, options: { allowCloudflareDetections?: boolean } = {}): string {
  const cleanOrigin = origin.replace(/\/+$/, '');
  const cloudflareDetections = options.allowCloudflareDetections === false
    ? ''
    : ` ${cleanOrigin}/cdn-cgi/challenge-platform/`;

  return [
    `script-src 'unsafe-inline' ${cleanOrigin}/_astro/${cloudflareDetections} https://static.cloudflareinsights.com https://challenges.cloudflare.com http://localhost:* http://127.0.0.1:*`,
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
  const url = new URL(request.url);
  headers.set('Content-Security-Policy', createHtmlScriptCsp(url.origin, {
    allowCloudflareDetections: !isMoodPath(url.pathname),
  }));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function accessRequired(): Response {
  return new Response(null, {
    status: 401,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

async function readAdminSession(context: {
  request: Request;
  locals: unknown;
  allowDevBypass?: boolean;
}): Promise<AdminSessionIdentity | null> {
  const url = new URL(context.request.url);
  const locals = context.locals as RuntimeEnvLocals | undefined;
  return (context.allowDevBypass ? readAdminDevBypassSession(locals, url.hostname) : null)
    ?? await readCloudflareAccessIdentity(context.request, locals);
}

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);
  const pathname = url.pathname;

  // Admin portal: served by this worker, gated by Cloudflare Access in production.
  if (isDevPortalPath(pathname)) {
    const session = await readAdminSession({ ...context, allowDevBypass: true });
    if (!session) {
      return accessRequired();
    }
    (context.locals as unknown as Record<string, unknown>).adminSession = session;
    return withHtmlSecurityHeaders(context.request, await next());
  }

  const docsVisibility = isDocsPath(pathname) ? await getDocsVisibilityFromContent(pathname) : 'missing';

  if (docsVisibility !== 'protected') {
    return withHtmlSecurityHeaders(context.request, await next());
  }

  const session = await readAdminSession(context);
  if (session) {
    (context.locals as unknown as Record<string, unknown>).adminSession = session;
    return withHtmlSecurityHeaders(context.request, await next());
  }

  return accessRequired();
});
