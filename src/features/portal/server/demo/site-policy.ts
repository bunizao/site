/* Demo answers for the owner's site-wide comment switches: read them, and
   change one or both.

   Same path, validation, error codes and bookkeeping as site-api
   (src/pages/admin/comments/site-policy.ts and comments/server/
   comment-site-policy.ts there): a PUT names at least one field, a field
   left out keeps its value, and a `*Since` stamp moves only when its switch
   turns on or changes value. The demo never answers 503: its one row is
   always there.

   The mode is a floor under every post, so the demo's per-post modes fold
   it into what readers get (modes.ts reads `demoSiteMode`). Dispatched from
   demo-api.ts. Only imported behind `import.meta.env.DEV`. */

import {
  COMMENTS_MODES,
  type AdminCommentSiteMode,
  type AdminCommentSitePolicy,
  type AdminCommentSitePolicyResponse,
  type CommentsMode,
} from '@bunizao/contracts';

const ALL_OFF: AdminCommentSitePolicy = { mode: null, modeSince: null, requireEmail: false, requireEmailSince: null };

let policy: AdminCommentSitePolicy = ALL_OFF;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Portal-Demo': '1' },
  });
}

function fail(status: number, code: string): Response {
  return json({ error: code, message: code }, status);
}

/** Back to both switches off, for demo-api.ts's reset. */
export function resetSitePolicyDemo(): void {
  policy = ALL_OFF;
}

/** The site-wide floor, for the demo's per-post modes. */
export function demoSiteMode(): AdminCommentSiteMode | null {
  return policy.mode;
}

/** The stricter of a post's own mode and the site's floor. */
export function stricterMode(mode: CommentsMode, floor: AdminCommentSiteMode | null): CommentsMode {
  return floor && COMMENTS_MODES.indexOf(floor) > COMMENTS_MODES.indexOf(mode) ? floor : mode;
}

async function change(request: Request): Promise<Response> {
  let body: { mode?: unknown; requireEmail?: unknown } | null;
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail(400, 'invalid_json');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'invalid_body');
  if (Object.keys(body).some((key) => key !== 'mode' && key !== 'requireEmail')) return fail(400, 'unknown_field');
  const { mode, requireEmail } = body;
  if (mode !== undefined && mode !== null && mode !== 'readonly' && mode !== 'off') return fail(400, 'invalid_mode');
  if (requireEmail !== undefined && typeof requireEmail !== 'boolean') return fail(400, 'invalid_require_email');
  if (mode === undefined && requireEmail === undefined) return fail(400, 'empty_change');

  const now = new Date().toISOString();
  const nextMode = mode === undefined ? policy.mode : (mode as AdminCommentSiteMode | null);
  const nextEmail = requireEmail === undefined ? policy.requireEmail : requireEmail;
  policy = {
    mode: nextMode,
    modeSince: nextMode === null ? null : nextMode === policy.mode ? (policy.modeSince ?? now) : now,
    requireEmail: nextEmail,
    requireEmailSince: nextEmail ? (policy.requireEmail ? (policy.requireEmailSince ?? now) : now) : null,
  };
  return json({ policy } satisfies AdminCommentSitePolicyResponse);
}

/** Answers `admin/comments/site-policy`, or null for a path this module
    does not own. `segments` starts after `admin`. */
export async function handleSitePolicyDemo(request: Request, segments: string[]): Promise<Response | null> {
  if (segments.length !== 2 || segments[0] !== 'comments' || segments[1] !== 'site-policy') return null;
  const method = request.method.toUpperCase();
  if (method === 'GET') return json({ policy } satisfies AdminCommentSitePolicyResponse);
  if (method === 'PUT') return change(request);
  return null;
}
