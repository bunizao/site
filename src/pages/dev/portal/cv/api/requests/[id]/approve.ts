import type { APIRoute } from 'astro';
import { approvePortalCvRequest } from '@/features/admin/server/portal-client';
import { jsonError, jsonOk } from '@/lib/http/json-response';

export const prerender = false;

export const POST: APIRoute = async ({ request, params, locals }) => {
  const id = params.id;
  if (!id) return jsonError(400, 'id_required', { 'Cache-Control': 'no-store, max-age=0' });

  try {
    return jsonOk(await approvePortalCvRequest(request, locals, id), {
      'Cache-Control': 'no-store, max-age=0',
    });
  } catch (error) {
    return jsonError(
      502,
      'approve_failed',
      { 'Cache-Control': 'no-store, max-age=0' },
      { message: error instanceof Error ? error.message : 'unknown' },
    );
  }
};
