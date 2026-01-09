import type { APIRoute } from 'astro';
import { getChannelInfo, type ChannelInfo } from '../../lib/telegram';

function getFirstImage(content: string): string | null {
  const match = content.match(/<img[^>]+src="([^">]+)"/);
  return match ? match[1] : null;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

function getNumericId(id: string): number {
  const parsed = Number.parseInt(id, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const before = url.searchParams.get('before') ?? '';

  try {
    const result = await getChannelInfo({ request, locals } as any, { type: 'list', before });
    const posts = (result as ChannelInfo).posts ?? [];
    const sortedPosts = [...posts].sort((a, b) => getNumericId(b.id) - getNumericId(a.id));

    const payload = sortedPosts.map((post) => {
      const previewText = (post.text ?? '').trim() || stripHtml(post.content);
      return {
        id: post.id,
        datetime: post.datetime,
        tag: post.tags?.[0] ?? '',
        previewText,
        image: getFirstImage(post.content),
      };
    });

    return new Response(JSON.stringify({ posts: payload }), {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Failed to fetch moods:', error);
    return new Response(JSON.stringify({ posts: [] }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
};
