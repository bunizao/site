import type { APIRoute } from 'astro';
import { handleOauthCallback } from '@/features/admin/server/oauth';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const result = await handleOauthCallback(request, locals);
  const headers = new Headers();
  result.cookies.forEach((cookie) => headers.append('Set-Cookie', cookie));

  if (result.ok) {
    headers.set('Location', result.redirectTo || '/dev/portal');
    return new Response(null, { status: 302, headers });
  }

  headers.set('Location', `/dev/login?error=${encodeURIComponent(result.reason)}`);
  return new Response(null, { status: 302, headers });
};
