import type { APIRoute } from 'astro';

import { postPath } from '@/features/posts/format';
import { getAllPosts } from '@/features/posts/server/content';

export const prerender = true;

// Data for the site-wide command palette (CommandPalette.astro). Prerendered
// so the palette never adds a Ghost fetch to SSR pages like /mood — the client
// pulls this static JSON lazily on first open.

export const GET: APIRoute = async () => {
  const posts = (await getAllPosts()).slice(0, 4).map((post) => ({
    title: post.title,
    path: postPath(post.slug),
  }));

  return new Response(JSON.stringify({ posts }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
