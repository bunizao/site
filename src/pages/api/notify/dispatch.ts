import type { APIRoute } from 'astro';
import { getNotifyConfig } from '@/lib/notify/env';
import {
  dispatchMoodNotification,
  isAuthorizedSecret,
  NotifyServiceError,
} from '@/lib/notify/service';

export const prerender = false;

interface DispatchBody {
  postId?: string;
  force?: boolean;
}

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const config = getNotifyConfig({ locals });

  if (!config.dispatchSecret || !isAuthorizedSecret(request, config.dispatchSecret)) {
    return unauthorized();
  }

  let body: DispatchBody;
  try {
    body = (await request.json()) as DispatchBody;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const result = await dispatchMoodNotification(
      {
        request,
        locals,
      },
      body.postId ?? '',
      {
        force: Boolean(body.force),
      }
    );

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    if (error instanceof NotifyServiceError) {
      return new Response(JSON.stringify({ error: error.message, code: error.code }), {
        status: error.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.error('Dispatch failed:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const ALL: APIRoute = async () => {
  return new Response('Method Not Allowed', { status: 405 });
};
