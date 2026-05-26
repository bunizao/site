import type { APIRoute } from 'astro';

export const prerender = false;

const headers = {
  'Cache-Control': 'no-store, max-age=0',
};

export const GET: APIRoute = () => {
  return new Response(null, {
    status: 204,
    headers,
  });
};

export const HEAD = GET;
