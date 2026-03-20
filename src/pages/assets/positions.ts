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

  return new Response(JSON.stringify({ ok: true, items: state.positions }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};

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
  const key = String(payload?.key || '').trim();
  if (!key) {
    return new Response(JSON.stringify({ ok: false, msg: '缺少 key' }), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  state.positions[key] = {
    x: Number(payload?.x || 0),
    y: Number(payload?.y || 0),
    scale: Number(payload?.scale || 1),
    updated_at: new Date().toISOString(),
  };

  return new Response(JSON.stringify({ ok: true, key, ...state.positions[key] }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
