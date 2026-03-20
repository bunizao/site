import type { APIRoute } from 'astro';
import { getOfficeStaticAssetItems } from '@/lib/office-drawer-store';

export const prerender = false;

export const GET: APIRoute = () => {
  const items = getOfficeStaticAssetItems();
  return new Response(JSON.stringify({
    ok: true,
    count: items.length,
    items,
  }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
