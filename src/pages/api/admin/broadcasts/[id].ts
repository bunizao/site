import type { APIRoute } from 'astro';
import { getBroadcast } from '@/features/admin/server/broadcasts';

export const prerender = false;

function jsonError(status: number, code: string, message?: string): Response {
  return new Response(JSON.stringify({ error: code, message: message || code }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET: APIRoute = async ({ request, params, locals }) => {
  const id = String(params.id || '');
  if (!id) return jsonError(400, 'id_required');
  try {
    const session = (locals as any).adminSession;
    const record = await getBroadcast(
      { request, locals, actor: session?.login || 'unknown' },
      id
    );
    if (!record) return jsonError(404, 'not_found');
    return new Response(JSON.stringify({ broadcast: record }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return jsonError(500, 'load_failed', error instanceof Error ? error.message : 'unknown');
  }
};
