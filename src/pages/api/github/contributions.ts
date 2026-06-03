import type { APIRoute } from 'astro';
import { createE2EGitHubContributions } from '@/features/home/server/e2e-fixtures';
import { isE2ESiteFixtureEnabled } from '@/lib/e2e';
import { fetchGitHubContributions } from '@/lib/github';
import { jsonBadRequest, jsonError, jsonOk } from '@/lib/http/json-response';
import { withRateLimit } from '@/lib/http/rate-limited';

export const prerender = false;

const DEFAULT_USERNAME = 'bunizao';
const ALLOWED_USERS = new Set([DEFAULT_USERNAME]);
const GITHUB_LOGIN_PATTERN = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;

function readRequestedUsername(request: Request): string {
  const url = new URL(request.url);
  return url.searchParams.get('username')?.trim() || DEFAULT_USERNAME;
}

export const GET: APIRoute = async ({ request, locals }) => {
  const rateLimit = withRateLimit(
    request,
    { windowMs: 60_000, max: 60, prefix: 'api:github:contributions' },
    locals
  );
  const successHeaders = new Headers(rateLimit.headers);
  successHeaders.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  const errorHeaders = new Headers(rateLimit.headers);
  errorHeaders.set('Cache-Control', 'no-store, max-age=0');

  if (!rateLimit.allowed) {
    return jsonError(429, 'Too Many Requests', errorHeaders);
  }

  const requestedUsername = readRequestedUsername(request);
  const username = requestedUsername.toLowerCase();
  if (!GITHUB_LOGIN_PATTERN.test(requestedUsername) || !ALLOWED_USERS.has(username)) {
    return jsonBadRequest('Unsupported GitHub username', errorHeaders);
  }

  if (isE2ESiteFixtureEnabled(locals)) {
    return jsonOk(createE2EGitHubContributions(), successHeaders);
  }

  const data = await fetchGitHubContributions(
    username,
    import.meta.env,
    locals?.runtime?.env
  );

  if (!data) {
    return jsonError(503, 'GitHub contributions unavailable', errorHeaders);
  }

  return jsonOk(data, successHeaders);
};

export const ALL: APIRoute = async () => {
  return new Response('Method Not Allowed', { status: 405 });
};
