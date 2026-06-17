import type { APIRoute } from 'astro';
import { loadMoodFeed } from '@/features/mood/server/api-client';
import { buildMoodRssXml } from '@/features/mood/server/serializers';

export const prerender = false;

const MAX_ITEMS = 50;

export const GET: APIRoute = async ({ request, locals, site }) => {
  const requestUrl = new URL(request.url);
  const baseUrl = site ?? new URL(requestUrl.origin);

  try {
    const feed = await loadMoodFeed({ request, locals }, { limit: MAX_ITEMS });
    const xml = buildMoodRssXml(feed.channel, feed.posts.slice(0, MAX_ITEMS), baseUrl);

    return new Response(xml, {
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=0, s-maxage=300',
      },
    });
  } catch (error) {
    console.error('Failed to generate moods RSS:', error);
    return new Response('Failed to generate RSS feed.', { status: 500 });
  }
};
