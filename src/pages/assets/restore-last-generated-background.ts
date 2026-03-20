import type { APIRoute } from 'astro';
import { forwardOfficeAssetsRequest, unsupportedOfficeAssetsResponse } from '@/lib/office-assets-proxy';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const proxied = await forwardOfficeAssetsRequest(context);
  return proxied || unsupportedOfficeAssetsResponse();
};
