import type { APIRoute } from 'astro';
import { previewBroadcast, type BroadcastAudience } from '@/features/admin/server/broadcasts';

export const prerender = false;

function jsonError(status: number, code: string, message?: string): Response {
  return new Response(JSON.stringify({ error: code, message: message || code }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  let payload: { subject?: string; body?: string; audience?: BroadcastAudience };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return jsonError(400, 'invalid_json');
  }

  if (!payload.subject || !payload.body || !payload.audience) {
    return jsonError(400, 'fields_required');
  }

  try {
    const session = (locals as any).adminSession;
    const result = await previewBroadcast(
      { request, locals, actor: session?.login || 'unknown' },
      {
        subject: payload.subject,
        body: payload.body,
        audience: payload.audience,
      }
    );
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'unknown';
    if (code === 'subject_required' || code === 'body_required') {
      return jsonError(400, code);
    }
    return jsonError(500, 'preview_failed', code);
  }
};
