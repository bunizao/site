import type { APIRoute } from 'astro';
import { isValidCursor } from '@/lib/http/query';
import { withRateLimit } from '@/lib/http/rate-limited';
import {
  loadMoodDocument,
  moodDocumentToFeedItem,
} from '@/features/mood/server/api-client';
import { resolveMoodApiV2Mode } from '@/features/mood/server/api-mode';
import { readMoodApiModeQueryValue } from '@/features/mood/shared/api-mode';
import { buildMoodAgentPostPageMarkdown } from '@/features/mood/server/serializers';

export const prerender = false;

function markdownResponse(body: string, status = 200, headers?: HeadersInit): Response {
  const nextHeaders = new Headers(headers);
  nextHeaders.set('Content-Type', 'text/markdown; charset=utf-8');
  if (!nextHeaders.has('Cache-Control')) {
    nextHeaders.set('Cache-Control', 'public, max-age=0, s-maxage=300');
  }
  return new Response(body, { status, headers: nextHeaders });
}

export const GET: APIRoute = async ({ params, request, locals, site }) => {
  const id = (params.id ?? '').trim();
  const url = new URL(request.url);
  const apiModeQueryValue = readMoodApiModeQueryValue(url);
  const useApiV2 = resolveMoodApiV2Mode(url, locals);
  const rateLimit = withRateLimit(
    request,
    { windowMs: 60_000, max: 180, prefix: 'agent:mood:post' },
    locals
  );

  if (!rateLimit.allowed) {
    return markdownResponse('Too many requests.\n', 429, rateLimit.headers);
  }

  if (!isValidCursor(id) || !id) {
    return markdownResponse('Invalid mood id.\n', 400, rateLimit.headers);
  }

  try {
    const post = await loadMoodDocument({ request, locals }, id, { useApiV2 });
    if (!post) {
      return markdownResponse('Mood post not found.\n', 404, rateLimit.headers);
    }

    const feedItem = moodDocumentToFeedItem(post);
    const requestUrl = new URL(request.url);
    const baseUrl = site ?? new URL(requestUrl.origin);
    const markdown = buildMoodAgentPostPageMarkdown(feedItem, baseUrl, {
      useApiV2,
      apiModeQueryValue,
    });

    return markdownResponse(markdown, 200, rateLimit.headers);
  } catch (error) {
    console.error('Failed to generate agent mood post:', error);
    return markdownResponse('Failed to generate mood post.\n', 500, rateLimit.headers);
  }
};
