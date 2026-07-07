import { defineMiddleware } from 'astro:middleware';
import { getDocsVisibilityFromContent } from '@/features/docs/server/content';
import { isDocsPath } from '@/features/docs/server/visibility';
import { readCloudflareAccessIdentity } from '@/features/admin/server/access';
import { redirectLegacyGhostHost } from '@/lib/http/legacy-ghost-redirect';
import type { RuntimeEnvLocals } from '@/lib/runtime/env';
import {
  cacheHtmlPageResponse,
  isNeverCachePath,
  readCachedHtmlPage,
  renderMarkdownIfRequested,
  withContentPolicy,
} from '@/features/agent-markdown/server/responses';
import {
  readAdminDevBypassSession,
  type AdminSessionIdentity,
} from '@/features/admin/server/dev-bypass';

const DEV_PORTAL_PREFIX = '/dev';

function appendCacheControlDirective(value: string | null, directive: string): string {
  const current = value?.trim();
  if (!current) return directive;
  if (new RegExp(`(?:^|,)\\s*${directive}\\b`, 'i').test(current)) return current;
  return `${current}, ${directive}`;
}

function isDevPortalPath(pathname: string): boolean {
  return pathname === DEV_PORTAL_PREFIX || pathname.startsWith(`${DEV_PORTAL_PREFIX}/`);
}

export function createHtmlScriptCsp(origin: string): string {
  const cleanOrigin = origin.replace(/\/+$/, '');

  return [
    `script-src 'unsafe-inline' ${cleanOrigin}/_astro/ https://js-cdn.music.apple.com https://static.cloudflareinsights.com https://challenges.cloudflare.com http://localhost:* http://127.0.0.1:*`,
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
  headers.set('Content-Security-Policy', createHtmlScriptCsp(url.origin));
  headers.set('Cache-Control', appendCacheControlDirective(headers.get('Cache-Control'), 'no-transform'));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function withNoStoreHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store, max-age=0');
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
  const legacyGhostRedirect = redirectLegacyGhostHost(url);
  if (legacyGhostRedirect) return legacyGhostRedirect;

  const markdownResponse = await renderMarkdownIfRequested(context);
  if (markdownResponse) return markdownResponse;

  const cachedHtmlPage = isNeverCachePath(pathname) ? null : await readCachedHtmlPage(context.request);
  if (cachedHtmlPage) return withHtmlSecurityHeaders(context.request, cachedHtmlPage);

  // Admin portal: served by this worker, gated by Cloudflare Access in production.
  if (isDevPortalPath(pathname)) {
    const session = await readAdminSession({ ...context, allowDevBypass: true });
    if (!session) {
      return accessRequired();
    }
    (context.locals as unknown as Record<string, unknown>).adminSession = session;
    return withNoStoreHeaders(withHtmlSecurityHeaders(context.request, await next()));
  }

  if (isNeverCachePath(pathname)) {
    return withNoStoreHeaders(withHtmlSecurityHeaders(context.request, await next()));
  }

  const docsVisibility = isDocsPath(pathname) ? await getDocsVisibilityFromContent(pathname) : 'missing';

  if (docsVisibility !== 'protected') {
    const response = withContentPolicy(
      context.request,
      withHtmlSecurityHeaders(context.request, await next()),
    );
    return cacheHtmlPageResponse(context.request, response);
  }

  const session = await readAdminSession(context);
  if (session) {
    (context.locals as unknown as Record<string, unknown>).adminSession = session;
    return withNoStoreHeaders(withHtmlSecurityHeaders(context.request, await next()));
  }

  return accessRequired();
});
