import type { APIRoute } from 'astro';
import { mintPortalCvOwnerLink } from '@/features/admin/server/portal-client';
import { jsonError, jsonOk } from '@/lib/http/json-response';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    return jsonOk(await mintPortalCvOwnerLink(request, locals), {
      'Cache-Control': 'no-store, max-age=0',
    });
  } catch (error) {
    return jsonError(
      502,
      'owner_link_failed',
      { 'Cache-Control': 'no-store, max-age=0' },
      { message: error instanceof Error ? error.message : 'unknown' },
    );
  }
};
