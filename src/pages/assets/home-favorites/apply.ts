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
  const hit = state.favorites.find((item) => item.id === id);
  if (!hit) {
    return new Response(JSON.stringify({ ok: false, msg: '收藏项不存在' }), {
      status: 404,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  if (hit.base64) {
    state.uploadedAssets['office_bg_small.webp'] = {
      contentType: hit.contentType || 'image/webp',
      base64: hit.base64,
      defaultAsset: state.uploadedAssets['office_bg_small.webp']?.defaultAsset,
      previousAsset: state.uploadedAssets['office_bg_small.webp']
        ? {
            contentType: state.uploadedAssets['office_bg_small.webp'].contentType,
            base64: state.uploadedAssets['office_bg_small.webp'].base64,
          }
        : undefined,
      updated_at: new Date().toISOString(),
    };
  }

  return new Response(JSON.stringify({ ok: true, path: 'office_bg_small.webp', from: hit.path, msg: '已应用收藏地图' }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
