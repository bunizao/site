import { defineMiddleware } from 'astro:middleware';
import { meta } from '@/data/site';
import { readCloudflareAccessIdentity } from '@/features/admin/server/access';
import { readOptionalEnv, type RuntimeEnvLocals } from '@/lib/runtime/env';
import {
  isNeverCachePath,
  redirectCanonicalUrl,
  redirectLegacyBlogUrl,
  renderMarkdownIfRequested,
  withContentPolicy,
} from '@/features/agent-markdown/server/responses';
import {
  readAdminDevBypassSession,
  type AdminSessionIdentity,
} from '@/features/admin/server/dev-bypass';

const DEV_PORTAL_PREFIX = '/dev';
const CANONICAL_HOSTNAME = new URL(meta.siteUrl).hostname;
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

// Anything answering on another hostname — the phone tunnel, a Worker preview
// URL, www — is a copy of buxx.me and must not compete with it in search.
// Canonical tags already point home; this is the belt for hosts a crawler
// reached before it read them. Local hosts are exempt so e2e assertions on
// the exact robots header stay meaningful.
export function isNonCanonicalHost(hostname: string): boolean {
  return hostname !== CANONICAL_HOSTNAME && !LOCAL_HOSTNAMES.has(hostname);
}
const DEV_BLOG_PREVIEW_PREFIX = '/dev/blog/';
const MOOD_EMBED_PATH = '/mood/embed';

function isDevPortalPath(pathname: string): boolean {
  return pathname === DEV_PORTAL_PREFIX || pathname.startsWith(`${DEV_PORTAL_PREFIX}/`);
}

function isDevBlogPreviewPath(pathname: string): boolean {
  return pathname.startsWith(DEV_BLOG_PREVIEW_PREFIX);
}

function isMoodEmbedPath(pathname: string): boolean {
  return pathname === MOOD_EMBED_PATH || pathname.startsWith(`${MOOD_EMBED_PATH}/`);
}

// The Ghost admin origin /dev/blog/* is allowed to frame it from (the
// koenig-editor live preview pane), derived from PUBLIC_GHOST_URL at request
// time. Origin only — no path — so a Ghost install at a subpath still matches.
// Exported so /dev/blog/[id].astro can render the same origin into the page
// as data-preview-parent-origin, for the message-channel trust check.
export function readGhostAdminOrigin(locals: RuntimeEnvLocals | undefined): string | null {
  const raw = readOptionalEnv(locals, 'PUBLIC_GHOST_URL');
  if (!raw) return null;

  try {
    const url = new URL(raw.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

export function createHtmlScriptCsp(
  options: { frameAncestors?: string | readonly string[] } = {},
): string {
  const directives = [
    "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.youtube.com https://js-cdn.music.apple.com https://static.cloudflareinsights.com https://challenges.cloudflare.com http://localhost:* http://127.0.0.1:*",
    "base-uri 'self'",
    "object-src 'none'",
  ];
  if (options.frameAncestors) {
    const values = Array.isArray(options.frameAncestors)
      ? options.frameAncestors
      : [options.frameAncestors as string];
    const tokens = values.map((value) => (value === 'self' || value === 'none' ? `'${value}'` : value));
    directives.push(`frame-ancestors ${tokens.join(' ')}`);
  }
  return directives.join('; ');
}

export function withHtmlSecurityHeaders(
  request: Request,
  response: Response,
  locals?: RuntimeEnvLocals,
): Response {
  const headers = new Headers(response.headers);

  // nosniff and referrer policy apply to every response: sniffing matters most
  // on non-HTML routes (SVG/XML/JSON), so these must not be gated behind the
  // HTML check below.
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (isNonCanonicalHost(new URL(request.url).hostname) && !headers.has('X-Robots-Tag')) {
    headers.set('X-Robots-Tag', 'noindex, nofollow');
  }

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
      // /dev/blog/[id] is iframed by the portal blog preview page (same
      // origin) and, when configured, by the Ghost admin origin (the
      // koenig-editor live preview pane); every other /dev path stays 'none'.
      const frameAncestors = isDevBlogPreviewPath(pathname)
        ? (() => {
          const ghostOrigin = readGhostAdminOrigin(locals);
          return ghostOrigin ? ['self', ghostOrigin] : ['self'];
        })()
        : isDevPortalPath(pathname) ? 'none' : 'self';
      headers.set('Content-Security-Policy', createHtmlScriptCsp({ frameAncestors }));
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
  const canonicalRedirect = redirectCanonicalUrl(context.request);
  if (canonicalRedirect) return canonicalRedirect;

  const markdownResponse = await renderMarkdownIfRequested(context);
  if (markdownResponse) return markdownResponse;

  // Dev runs without src/worker.ts, so the legacy article redirect lives here too.
  const legacyBlogRedirect = await redirectLegacyBlogUrl(context.request, context.locals);
  if (legacyBlogRedirect) return legacyBlogRedirect;

  // Admin portal: served by this worker, gated by Cloudflare Access in production.
  if (isDevPortalPath(pathname)) {
    const session = await readAdminSession({ ...context, allowDevBypass: true });
    if (!session) {
      return accessRequired();
    }
    (context.locals as unknown as Record<string, unknown>).adminSession = session;
    return withNoStoreHeaders(withHtmlSecurityHeaders(context.request, await next(), context.locals as RuntimeEnvLocals | undefined));
  }

  if (isNeverCachePath(pathname)) {
    return withNoStoreHeaders(withHtmlSecurityHeaders(context.request, await next(), context.locals as RuntimeEnvLocals | undefined));
  }

  // The edge HTML cache lives in src/worker.ts, the production entrypoint;
  // this middleware only decorates the rendered response. Dev therefore always
  // renders fresh, which is what dev wants.
  return withContentPolicy(
    context.request,
    withHtmlSecurityHeaders(context.request, await next(), context.locals as RuntimeEnvLocals | undefined),
  );
});
