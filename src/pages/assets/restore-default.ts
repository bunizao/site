import type { APIRoute } from 'astro';
import { forwardOfficeAssetsRequest } from '@/lib/office-assets-proxy';
import { getOfficeDrawerState } from '@/lib/office-drawer-store';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const proxied = await forwardOfficeAssetsRequest(context);
  if (proxied) {
    return proxied;
  }

  const { request } = context;
  const state = getOfficeDrawerState();
  if (!state.authed) {
    return new Response(JSON.stringify({ ok: false, code: 'UNAUTHORIZED', msg: 'Asset editor auth required' }), {
      status: 401,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  const payload = await request.json().catch(() => ({}));
  const assetPath = String(payload?.path || '').trim().replace(/^\/+/, '');
  const existing = state.uploadedAssets[assetPath];
  if (!assetPath || !existing?.defaultAsset) {
    return new Response(JSON.stringify({ ok: false, msg: '未找到默认资产快照' }), {
      status: 404,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  existing.previousAsset = {
    contentType: existing.contentType,
    base64: existing.base64,
  };
  existing.contentType = existing.defaultAsset.contentType;
  existing.base64 = existing.defaultAsset.base64;
  existing.updated_at = new Date().toISOString();

  return new Response(JSON.stringify({ ok: true, path: assetPath, msg: '已重置为默认资产' }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
