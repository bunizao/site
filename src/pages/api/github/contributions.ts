import type { APIRoute } from 'astro';
import { createE2EGitHubContributions } from '@/features/home/server/e2e-fixtures';
import { isE2ESiteFixtureEnabled } from '@/lib/e2e';
import { fetchGitHubContributions, type GitHubContributionsData } from '@/lib/github';
import { jsonBadRequest, jsonError, jsonOk } from '@/lib/http/json-response';
import { withRateLimit } from '@/lib/http/rate-limited';
import { readRuntimeEnvSource } from '@/lib/runtime/env';

export const prerender = false;

const DEFAULT_USERNAME = 'bunizao';
const DEFAULT_CONTRIBUTION_DAYS = 365;
const MAX_CONTRIBUTION_DAYS = 365;
const ALLOWED_USERS = new Set([DEFAULT_USERNAME]);
const GITHUB_LOGIN_PATTERN = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;

function readRequestedUsername(request: Request): string {
  const url = new URL(request.url);
  return url.searchParams.get('username')?.trim() || DEFAULT_USERNAME;
}

function readRequestedDays(request: Request): number | null {
  const url = new URL(request.url);
  const rawDays = url.searchParams.get('days')?.trim();
  if (!rawDays) return DEFAULT_CONTRIBUTION_DAYS;
  if (!/^\d+$/.test(rawDays)) return null;

  const days = Number.parseInt(rawDays, 10);
  if (days < 1 || days > MAX_CONTRIBUTION_DAYS) return null;

  return days;
}

function trimContributionWindow(data: GitHubContributionsData, days: number): GitHubContributionsData {
  if (days >= MAX_CONTRIBUTION_DAYS) return data;

  return {
    total: data.total,
    contributions: data.contributions.slice(-days)
  };
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

  const days = readRequestedDays(request);
  if (days === null) {
    return jsonBadRequest('Unsupported contribution window', errorHeaders);
  }

  if (isE2ESiteFixtureEnabled(locals)) {
    return jsonOk(trimContributionWindow(createE2EGitHubContributions(), days), successHeaders);
  }

  const data = await fetchGitHubContributions(
    username,
    import.meta.env,
    readRuntimeEnvSource(locals),
    { days }
  );

  if (!data) {
    return jsonError(503, 'GitHub contributions unavailable', errorHeaders);
  }

  return jsonOk(data, successHeaders);
};

export const ALL: APIRoute = async () => {
  return new Response('Method Not Allowed', { status: 405 });
};
