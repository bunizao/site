import type { APIRoute } from 'astro';
import { API_PREFIX } from '@bunizao/contracts/routes';

export const prerender = false;

export const ALL: APIRoute = ({ params, request }) => {
  const url = new URL(request.url);
  const path = params.path ? `/${params.path.replace(/^\/+/, '')}` : '';
  url.pathname = `${API_PREFIX}/v2${path}`;

  return new Response(null, {
    status: 308,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      Location: url.toString(),
    },
  });
};
