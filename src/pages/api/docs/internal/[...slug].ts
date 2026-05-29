import type { APIRoute } from 'astro';
import { getEntry, render } from 'astro:content';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import {
  isAllowedLogin,
  readAdminAuthConfig,
  readAdminDevSession,
  readSessionFromCookieHeader,
  verifySessionToken,
} from '@/features/admin/server/session';

// Server-only endpoint that returns the rendered HTML body of an internal
// docs page when the request carries a valid admin_session cookie. The
// public HTML for these pages ships with the body redacted; this endpoint
// is what swaps the real content in after sign-in.
export const prerender = false;

export const GET: APIRoute = async ({ params, request, locals }) => {
  const slugParts = (params.slug ?? '') as string;
  if (!slugParts) {
    return jsonError(400, 'missing slug');
  }

  // Reject anything that tries to escape the docs collection.
  if (slugParts.includes('..') || slugParts.startsWith('/')) {
    return jsonError(400, 'invalid slug');
  }

  // 1. Auth — same gate as /dev/portal/**.
  const config = readAdminAuthConfig(locals);
  const cookieHeader = request.headers.get('cookie');
  const token = readSessionFromCookieHeader(cookieHeader);
  const session = config.sessionSigningKey
    ? await verifySessionToken(token, config.sessionSigningKey)
    : null;
  const url = new URL(request.url);
  const devSession = readAdminDevSession(locals, import.meta.env.DEV, url.hostname);

  const authed =
    (session && isAllowedLogin(session.login, config.allowedLogin)) ||
    Boolean(devSession);

  if (!authed) {
    return jsonError(401, 'unauthorized');
  }

  // 2. Resolve the entry. Slugs in src/content/docs/docs/<x>.md show up as
  //    ids of `docs/<x>` because the collection root is src/content/docs/.
  const entryId = `docs/${slugParts}`;
  const entry = await getEntry('docs', entryId);
  if (!entry) {
    return jsonError(404, 'not found');
  }

  const data = entry.data as { internal?: boolean };
  // Only internal pages are served from this endpoint. Public pages already
  // ship their HTML at the regular /docs/* URL — answering 404 here keeps
  // this endpoint scoped to the auth gate it exists for.
  if (data.internal !== true) {
    return jsonError(404, 'not found');
  }

  // 3. Render the markdown body to HTML via the Container API.
  let html: string;
  try {
    const { Content } = await render(entry);
    const container = await AstroContainer.create();
    html = await container.renderToString(Content);
  } catch (error) {
    return jsonError(500, error instanceof Error ? error.message : 'render failed');
  }

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Per-request, cookie-gated — never cache between users.
      'Cache-Control': 'private, no-store',
    },
  });
};

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
