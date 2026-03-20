import type { APIRoute } from 'astro';
import { getOfficeDrawerState, readOfficeStaticAssetSnapshot } from '@/lib/office-drawer-store';

export const prerender = false;

async function fileToBase64(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return buffer.toString('base64');
}

export const POST: APIRoute = async ({ request }) => {
  const state = getOfficeDrawerState();
  if (!state.authed) {
    return new Response(JSON.stringify({ ok: false, code: 'UNAUTHORIZED', msg: 'Asset editor auth required' }), {
      status: 401,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  const form = await request.formData();
  const assetPath = String(form.get('path') || '').trim().replace(/^\/+/, '');
  const file = form.get('file');
  if (!assetPath || !(file instanceof File)) {
    return new Response(JSON.stringify({ ok: false, msg: '缺少 path 或 file' }), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  const contentType = file.type || 'application/octet-stream';
  const base64 = await fileToBase64(file);
  const existing = state.uploadedAssets[assetPath];
  const defaultAsset = existing?.defaultAsset
    || existing
    || await readOfficeStaticAssetSnapshot(assetPath)
    || undefined;

  state.uploadedAssets[assetPath] = {
    contentType,
    base64,
    defaultAsset,
    previousAsset: existing || undefined,
    updated_at: new Date().toISOString(),
  };

  return new Response(JSON.stringify({
    ok: true,
    path: assetPath,
    msg: '已上传',
  }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
