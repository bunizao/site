import type { APIRoute } from 'astro';
import { getOfficeDrawerState } from '@/lib/office-drawer-store';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const state = getOfficeDrawerState();
  if (!state.authed) {
    return new Response(JSON.stringify({ ok: false, code: 'UNAUTHORIZED', msg: 'Asset editor auth required' }), {
      status: 401,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  const payload = await request.json().catch(() => ({}));
  const id = String(payload?.id || '').trim();
  state.favorites = state.favorites.filter((item) => item.id !== id);

  return new Response(JSON.stringify({ ok: true, id, msg: '已删除收藏' }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
