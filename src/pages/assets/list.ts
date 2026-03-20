import type { APIRoute } from 'astro';
import { forwardOfficeAssetsRequest } from '@/lib/office-assets-proxy';
import { getOfficeStaticAssetItems } from '@/lib/office-drawer-store';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const proxied = await forwardOfficeAssetsRequest(context);
  if (proxied) {
    return proxied;
  }

  const items = getOfficeStaticAssetItems();
  return new Response(JSON.stringify({
    ok: true,
    count: items.length,
    items,
  }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
