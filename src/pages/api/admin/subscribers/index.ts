import type { APIRoute } from 'astro';
import {
  adminCreateSubscriber,
  listSubscribers,
  type AdminSubscriberInput,
} from '@/features/admin/server/subscribers-admin';
import type { DeliveryMode, NotifyChannel, SubscriberStatus } from '@/features/notify/server/types';

export const prerender = false;

function jsonError(status: number, code: string, message?: string): Response {
  return new Response(JSON.stringify({ error: code, message: message || code }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const session = (locals as any).adminSession;
    const url = new URL(request.url);
    const status = url.searchParams.get('status') as SubscriberStatus | 'all' | null;
    const channel = url.searchParams.get('channel') as NotifyChannel | null;
    const deliveryMode = url.searchParams.get('deliveryMode') as DeliveryMode | null;
    const search = url.searchParams.get('search') || undefined;
    const limit = Number(url.searchParams.get('limit') || '50');
    const offset = Number(url.searchParams.get('offset') || '0');

    const data = await listSubscribers(
      { request, locals, actor: session?.login || 'unknown' },
      {
        status: status ?? 'all',
        channel: channel ?? undefined,
        deliveryMode: deliveryMode ?? undefined,
        search,
        limit: Number.isFinite(limit) ? limit : 50,
        offset: Number.isFinite(offset) ? offset : 0,
      }
    );

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    return jsonError(500, 'list_failed', message);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  let payload: Partial<AdminSubscriberInput>;
  try {
    payload = (await request.json()) as Partial<AdminSubscriberInput>;
  } catch {
    return jsonError(400, 'invalid_json');
  }
  if (!payload?.email) return jsonError(400, 'email_required');

  const session = (locals as any).adminSession;
  const input: AdminSubscriberInput = {
    email: String(payload.email),
    status: (payload.status as SubscriberStatus) || 'active',
    channels: Array.isArray(payload.channels) && payload.channels.length
      ? (payload.channels as NotifyChannel[])
      : ['mood'],
    deliveryMode: (payload.deliveryMode as DeliveryMode) || 'immediate',
    timezone: typeof payload.timezone === 'string' ? payload.timezone : undefined,
    dailyHour: typeof payload.dailyHour === 'number' ? payload.dailyHour : undefined,
  };

  try {
    const record = await adminCreateSubscriber(
      { request, locals, actor: session?.login || 'unknown' },
      input
    );
    return new Response(JSON.stringify({ subscriber: record }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'unknown';
    if (code === 'invalid_email' || code === 'subscriber_exists') {
      return jsonError(400, code);
    }
    return jsonError(500, 'create_failed', code);
  }
};
