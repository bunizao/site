import type { APIRoute } from 'astro';
import {
  countAudience,
  listBroadcasts,
  sendBroadcast,
  type BroadcastAudience,
} from '@/features/admin/server/broadcasts';

export const prerender = false;

function jsonError(status: number, code: string, message?: string): Response {
  return new Response(JSON.stringify({ error: code, message: message || code }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get('limit') || '30');
    const offset = Number(url.searchParams.get('offset') || '0');
    const session = (locals as any).adminSession;
    const broadcasts = await listBroadcasts(
      { request, locals, actor: session?.login || 'unknown' },
      { limit, offset }
    );
    return new Response(JSON.stringify({ broadcasts }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return jsonError(500, 'list_failed', error instanceof Error ? error.message : 'unknown');
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  let payload: { subject?: string; body?: string; audience?: BroadcastAudience; dryRun?: boolean };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return jsonError(400, 'invalid_json');
  }

  if (!payload.subject || !payload.body || !payload.audience) {
    return jsonError(400, 'fields_required');
  }

  const session = (locals as any).adminSession;
  const ctx = { request, locals, actor: session?.login || 'unknown' };

  try {
    if (payload.dryRun) {
      const recipientCount = await countAudience(ctx, payload.audience);
      return new Response(JSON.stringify({ recipientCount }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await sendBroadcast(ctx, {
      subject: payload.subject,
      body: payload.body,
      audience: payload.audience,
    });
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'unknown';
    if (
      code === 'subject_required'
      || code === 'body_required'
      || code === 'audience_required'
      || code === 'audience_empty'
    ) {
      return jsonError(400, code);
    }
    return jsonError(500, 'send_failed', code);
  }
};
