import type { APIRoute } from 'astro';
import { jsonOk } from '@/lib/http/json-response';
import { readRuntimeEnv, signedRequestPath } from '@/lib/security/signed-url';

// The SVG gallery's activity panel only renders with a signed URL, and the
// signing secret must stay on the server, so the client screen asks here.
// Links last an hour, as they did on the server-rendered gallery. Without a
// secret the paths come back unsigned and the panel answers 401.
export const prerender = false;

const PANEL_PATH = '/api/activity-panel.svg';

export const GET: APIRoute = ({ locals }) => {
  const secret = readRuntimeEnv(locals, 'ACTIVITY_PANEL_SIGNING_SECRET') || import.meta.env.ACTIVITY_PANEL_SIGNING_SECRET || '';
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60;
  const src = (theme: 'dark' | 'light'): string => {
    const params = new URLSearchParams({ theme });
    return secret ? signedRequestPath(PANEL_PATH, params, secret, expiresAt) : `${PANEL_PATH}?${params}`;
  };
  return jsonOk(
    { signed: Boolean(secret), expiresAt: new Date(expiresAt * 1000).toISOString(), dark: src('dark'), light: src('light') },
    { 'Cache-Control': 'no-store' },
  );
};
