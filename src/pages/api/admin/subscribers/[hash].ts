import type { APIRoute } from 'astro';
import {
  adminAuditResendConfirm,
  adminDeleteSubscriber,
  adminUpdateSubscriber,
  getSubscriberAuditTrail,
  getSubscriberByHash,
  type AdminSubscriberPatch,
} from '@/features/admin/server/subscribers-admin';
import type { DeliveryMode, NotifyChannel, SubscriberStatus } from '@/features/notify/server/types';

export const prerender = false;

function jsonError(status: number, code: string, message?: string): Response {
  return new Response(JSON.stringify({ error: code, message: message || code }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET: APIRoute = async ({ request, params, locals }) => {
  const hash = String(params.hash || '');
  if (!hash) return jsonError(400, 'hash_required');
  try {
    const session = (locals as any).adminSession;
    const ctx = { request, locals, actor: session?.login || 'unknown' };
    const subscriber = await getSubscriberByHash(ctx, hash);
    if (!subscriber) return jsonError(404, 'not_found');
    const audit = await getSubscriberAuditTrail(ctx, hash, 100);
    return new Response(JSON.stringify({ subscriber, audit }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return jsonError(500, 'load_failed', error instanceof Error ? error.message : 'unknown');
  }
};

export const PATCH: APIRoute = async ({ request, params, locals }) => {
  const hash = String(params.hash || '');
  if (!hash) return jsonError(400, 'hash_required');

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError(400, 'invalid_json');
  }

  const patch: AdminSubscriberPatch = {};
  if (typeof payload.status === 'string') patch.status = payload.status as SubscriberStatus;
  if (Array.isArray(payload.channels)) patch.channels = payload.channels as NotifyChannel[];
  if (typeof payload.deliveryMode === 'string') {
    patch.deliveryMode = payload.deliveryMode as DeliveryMode;
  }
  if (typeof payload.timezone === 'string' || payload.timezone === null) {
    patch.timezone = payload.timezone as string | null;
  }
  if (typeof payload.dailyHour === 'number' || payload.dailyHour === null) {
    patch.dailyHour = payload.dailyHour as number | null;
  }

  try {
    const session = (locals as any).adminSession;
    const ctx = { request, locals, actor: session?.login || 'unknown' };
    const record = await adminUpdateSubscriber(ctx, hash, patch);

    if (payload.action === 'resend_confirm') {
      await adminAuditResendConfirm(ctx, record.email);
    }

    return new Response(JSON.stringify({ subscriber: record }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'unknown';
    if (code === 'subscriber_not_found') return jsonError(404, code);
    return jsonError(500, 'update_failed', code);
  }
};

export const DELETE: APIRoute = async ({ request, params, locals }) => {
  const hash = String(params.hash || '');
  if (!hash) return jsonError(400, 'hash_required');
  try {
    const session = (locals as any).adminSession;
    await adminDeleteSubscriber(
      { request, locals, actor: session?.login || 'unknown' },
      hash
    );
    return new Response(null, { status: 204 });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'unknown';
    if (code === 'subscriber_not_found') return jsonError(404, code);
    return jsonError(500, 'delete_failed', code);
  }
};
