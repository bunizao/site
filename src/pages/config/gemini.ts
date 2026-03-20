import type { APIRoute } from 'astro';
import { getOfficeDrawerState, maskOfficeApiKey } from '@/lib/office-drawer-store';

export const prerender = false;

export const GET: APIRoute = () => {
  const state = getOfficeDrawerState();
  if (!state.authed) {
    return new Response(JSON.stringify({ ok: false, code: 'UNAUTHORIZED', msg: 'Asset editor auth required' }), {
      status: 401,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  return new Response(JSON.stringify({
    ok: true,
    has_api_key: !!state.gemini.apiKey,
    api_key_masked: maskOfficeApiKey(state.gemini.apiKey),
    gemini_model: state.gemini.model,
  }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  const state = getOfficeDrawerState();
  if (!state.authed) {
    return new Response(JSON.stringify({ ok: false, code: 'UNAUTHORIZED', msg: 'Asset editor auth required' }), {
      status: 401,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  const payload = await request.json().catch(() => ({}));
  state.gemini.apiKey = String(payload?.api_key || '').trim();
  state.gemini.model = String(payload?.model || 'nanobanana-pro').trim() || 'nanobanana-pro';

  return new Response(JSON.stringify({
    ok: true,
    api_key_masked: maskOfficeApiKey(state.gemini.apiKey),
    gemini_model: state.gemini.model,
  }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
