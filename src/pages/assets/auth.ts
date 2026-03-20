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
  const payload = await request.json().catch(() => ({}));
  const password = String(payload?.password || '').trim();
  if (password === '1234') {
    const state = getOfficeDrawerState();
    state.authed = true;
    return new Response(JSON.stringify({ ok: true, msg: '认证成功' }), {
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  return new Response(JSON.stringify({ ok: false, msg: '验证码错误' }), {
    status: 401,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
