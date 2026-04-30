import type { APIRoute } from 'astro';
import {
  isValidCursor,
  readCursorQuery,
} from '@/lib/http/query';
import { withRateLimit } from '@/lib/http/rate-limited';
import { loadMoodChannelSnapshot } from '@/features/mood/server/channel-service';
import { buildMoodFeedResponse } from '@/features/mood/server/feed-service';
import { buildMoodAgentMarkdown } from '@/features/mood/server/serializers';

export const prerender = false;

function markdownResponse(body: string, status = 200, headers?: HeadersInit): Response {
  const nextHeaders = new Headers(headers);
  nextHeaders.set('Content-Type', 'text/markdown; charset=utf-8');
  if (!nextHeaders.has('Cache-Control')) {
    nextHeaders.set('Cache-Control', 'public, max-age=0, s-maxage=300');
  }
  return new Response(body, { status, headers: nextHeaders });
}

export const GET: APIRoute = async ({ request, locals, site }) => {
  const url = new URL(request.url);
  const before = readCursorQuery(url, 'before');
  const after = readCursorQuery(url, 'after');
  const rateLimit = withRateLimit(
    request,
    { windowMs: 60_000, max: 180, prefix: 'agent:mood' },
    locals
  );

  if (!rateLimit.allowed) {
    return markdownResponse('Too many requests.\n', 429, rateLimit.headers);
  }

  if (!isValidCursor(before) || !isValidCursor(after)) {
    return markdownResponse('Invalid cursor parameter.\n', 400, rateLimit.headers);
  }

  try {
    const { channelInfo, posts } = await loadMoodChannelSnapshot(
      { request, locals },
      { before, after }
    );
    const feed = await buildMoodFeedResponse({ request, locals }, channelInfo, posts);
    const requestUrl = new URL(request.url);
    const baseUrl = site ?? new URL(requestUrl.origin);
    const markdown = buildMoodAgentMarkdown(feed, baseUrl, { before, after });

    return markdownResponse(markdown, 200, rateLimit.headers);
  } catch (error) {
    console.error('Failed to generate agent mood feed:', error);
    return markdownResponse('Failed to generate mood feed.\n', 500, rateLimit.headers);
  }
};
