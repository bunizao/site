import type { APIRoute } from 'astro';
import { forwardOfficeAssetsRequest } from '@/lib/office-assets-proxy';
import { getOfficeDrawerState } from '@/lib/office-drawer-store';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const proxied = await forwardOfficeAssetsRequest(context);
  if (proxied) {
    return proxied;
  }

  const state = getOfficeDrawerState();
  if (!state.authed) {
    return new Response(JSON.stringify({ ok: false, code: 'UNAUTHORIZED', msg: 'Asset editor auth required' }), {
      status: 401,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  const id = String(context.url.searchParams.get('id') || '').trim();
  const item = state.favorites.find((favorite) => favorite.id === id);
  if (!item?.base64) {
    return new Response('Not Found', { status: 404 });
  }

  return new Response(Buffer.from(item.base64, 'base64'), {
    headers: {
      'content-type': item.contentType || 'image/webp',
      'cache-control': 'no-store',
    },
  });
};
