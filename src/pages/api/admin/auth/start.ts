import type { APIRoute } from 'astro';
import { buildOauthStartResult } from '@/features/admin/server/oauth';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals, redirect }) => {
  const url = new URL(request.url);
  const next = url.searchParams.get('next') || '/dev/portal';

  const result = buildOauthStartResult(request, locals, next);
  if (!result) {
    return redirect(`/dev/login?error=config`, 302);
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: result.redirectUrl,
      'Set-Cookie': result.stateCookie,
    },
  });
};
