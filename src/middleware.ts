import { defineMiddleware } from 'astro:middleware';
import { readCloudflareAccessIdentity } from '@/features/admin/server/access';
import { redirectLegacyGhostHost } from '@/lib/http/legacy-ghost-redirect';
import type { RuntimeEnvLocals } from '@/lib/runtime/env';
import {
  isNeverCachePath,
  redirectCanonicalUrl,
  renderMarkdownIfRequested,
  withContentPolicy,
} from '@/features/agent-markdown/server/responses';
import {
  readAdminDevBypassSession,
  type AdminSessionIdentity,
} from '@/features/admin/server/dev-bypass';

const DEV_PORTAL_PREFIX = '/dev';
const MOOD_EMBED_PATH = '/mood/embed';

function isDevPortalPath(pathname: string): boolean {
  return pathname === DEV_PORTAL_PREFIX || pathname.startsWith(`${DEV_PORTAL_PREFIX}/`);
}

function isMoodEmbedPath(pathname: string): boolean {
  return pathname === MOOD_EMBED_PATH || pathname.startsWith(`${MOOD_EMBED_PATH}/`);
}

export function createHtmlScriptCsp(options: { frameAncestors?: 'none' | 'self' } = {}): string {
  const directives = [
    "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.youtube.com https://js-cdn.music.apple.com https://static.cloudflareinsights.com https://challenges.cloudflare.com http://localhost:* http://127.0.0.1:*",
    "base-uri 'self'",
    "object-src 'none'",
  ];
  if (options.frameAncestors) {
    directives.push(`frame-ancestors '${options.frameAncestors}'`);
  }
  return directives.join('; ');
}

export function withHtmlSecurityHeaders(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);

  // nosniff and referrer policy apply to every response: sniffing matters most
  // on non-HTML routes (SVG/XML/JSON), so these must not be gated behind the
  // HTML check below.
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  const contentType = response.headers.get('content-type') ?? '';
  const isHtml = contentType.toLowerCase().includes('text/html');
  if (isHtml) {
    const pathname = new URL(request.url).pathname;
    if (isMoodEmbedPath(pathname)) {
      // The embed surface is deliberately framable: it sets its own CSP with
      // frame-ancestors * (src/lib/embed-response.ts). Keep that CSP; only
      // apply the base one when the embed somehow shipped without it.
      if (!headers.has('Content-Security-Policy')) {
        headers.set('Content-Security-Policy', createHtmlScriptCsp());
      }
    } else {
      headers.set('Content-Security-Policy', createHtmlScriptCsp({
        frameAncestors: isDevPortalPath(pathname) ? 'none' : 'self',
      }));
    }
  }

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

  const canonicalRedirect = redirectCanonicalUrl(context.request);
  if (canonicalRedirect) return canonicalRedirect;

  const markdownResponse = await renderMarkdownIfRequested(context);
  if (markdownResponse) return markdownResponse;

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

  // The edge HTML cache lives in src/worker.ts, the production entrypoint;
  // this middleware only decorates the rendered response. Dev therefore always
  // renders fresh, which is what dev wants.
  return withContentPolicy(
    context.request,
    withHtmlSecurityHeaders(context.request, await next()),
  );
});
