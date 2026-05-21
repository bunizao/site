import type { APIRoute } from 'astro';
import { buildOauthStartResult } from '@/features/admin/server/oauth';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals, redirect }) => {
  const url = new URL(request.url);
  const next = url.searchParams.get('next') || '/dev/portal';

  const result = await buildOauthStartResult(request, locals, next, import.meta.env.DEV);
  if (!result) {
    return redirect(`/dev/login?error=config`, 302);
  }

  const headers = new Headers({
    Location: result.redirectUrl,
  });
  result.cookies.forEach((cookie) => headers.append('Set-Cookie', cookie));

  return new Response(null, {
    status: 302,
    headers,
  });
};
