import type { APIRoute } from 'astro';
import { getOfficeDrawerState } from '@/lib/office-drawer-store';

export const prerender = false;

export const GET: APIRoute = () => {
  const state = getOfficeDrawerState();
  if (!state.authed) {
    return new Response(JSON.stringify({ ok: false, code: 'UNAUTHORIZED', msg: 'Asset editor auth required' }), {
      status: 401,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  return new Response(JSON.stringify({ ok: true, items: state.favorites }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
