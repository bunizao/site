import type { APIRoute } from 'astro';

export const prerender = false;

export const ALL: APIRoute = () => new Response(null, {
  status: 302,
  headers: {
    Location: '/dev/portal/blog',
  },
});
