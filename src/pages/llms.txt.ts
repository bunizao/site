import type { APIRoute } from 'astro';

import { meta } from '@/data/site';
import { postPath } from '@/features/posts/format';
import { getAllPosts } from '@/features/posts/server/content';

export const prerender = true;

function lineLink(label: string, url: URL): string {
  return `- ${label}: ${url.href}`;
}

export const GET: APIRoute = async ({ site }) => {
  const baseUrl = site ?? new URL(meta.siteUrl);
  const posts = (await getAllPosts()).slice(0, 5);
  const lines = [
    '# Bunizao',
    '',
    meta.description,
    '',
    'Fetch these URLs with `Accept: text/markdown` for Markdown renditions.',
    '',
    lineLink('Home', new URL('/', baseUrl)),
    lineLink('Blog', new URL('/blog/', baseUrl)),
    lineLink('Mood', new URL('/mood', baseUrl)),
    lineLink('Privacy', new URL('/privacy', baseUrl)),
    '',
    '## Recent Posts',
    '',
    ...posts.map((post) => lineLink(post.title, new URL(postPath(post.slug), baseUrl))),
    '',
  ];

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=300',
    },
  });
};
