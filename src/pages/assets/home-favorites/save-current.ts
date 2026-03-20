import type { APIRoute } from 'astro';
import { getOfficeDrawerState } from '@/lib/office-drawer-store';

export const prerender = false;

export const POST: APIRoute = () => {
  const state = getOfficeDrawerState();
  if (!state.authed) {
    return new Response(JSON.stringify({ ok: false, code: 'UNAUTHORIZED', msg: 'Asset editor auth required' }), {
      status: 401,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  const item = {
    id: `home-${Date.now()}`,
    path: 'office_bg_small.webp',
    url: '/office-runtime/static/office_bg_small.webp',
    thumb_url: '/office-runtime/static/office_bg_small.webp',
    created_at: new Date().toISOString(),
  };
  state.favorites = [item, ...state.favorites].slice(0, 30);

  return new Response(JSON.stringify({ ok: true, id: item.id, path: item.path, msg: '已收藏当前地图' }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
