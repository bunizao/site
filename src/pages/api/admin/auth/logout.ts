import type { APIRoute } from 'astro';
import { buildClearSessionCookie } from '@/features/admin/server/session';

export const prerender = false;

export const POST: APIRoute = async () => {
  return new Response(null, {
    status: 303,
    headers: {
      Location: '/oauth/login',
      'Set-Cookie': buildClearSessionCookie(),
    },
  });
};
