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
  return new Response(JSON.stringify({
    ok: true,
    authed: state.authed,
    drawer_default_pass: true,
  }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
