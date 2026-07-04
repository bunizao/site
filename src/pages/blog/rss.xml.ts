import type { APIRoute } from 'astro';
import { getAllPosts } from '@/features/posts/server/content';
import { buildBlogRssXml } from '@/features/posts/server/rss';

export const prerender = true;

export const GET: APIRoute = async () => {
  const posts = await getAllPosts();

  return new Response(buildBlogRssXml(posts), {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  });
};
