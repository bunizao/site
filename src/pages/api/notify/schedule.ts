import type { APIRoute } from 'astro';
import { getNotifyConfig } from '@/lib/notify/env';
import {
  dispatchScheduledMoodNotifications,
  isAuthorizedSecret,
  NotifyServiceError,
} from '@/lib/notify/service';

export const prerender = false;

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

function isAuthorizedForSchedule(request: Request, locals: any): boolean {
  const config = getNotifyConfig({ locals });

  if (config.cronSecret && isAuthorizedSecret(request, config.cronSecret)) {
    return true;
  }

  if (config.dispatchSecret && isAuthorizedSecret(request, config.dispatchSecret)) {
    return true;
  }

  return false;
}

async function handleSchedule(request: Request, locals: any): Promise<Response> {
  if (!isAuthorizedForSchedule(request, locals)) {
    return unauthorized();
  }

  try {
    const result = await dispatchScheduledMoodNotifications({ request, locals });
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

    console.error('Schedule process failed:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export const GET: APIRoute = async ({ request, locals }) => {
  return handleSchedule(request, locals);
};

export const POST: APIRoute = async ({ request, locals }) => {
  return handleSchedule(request, locals);
};

export const ALL: APIRoute = async () => {
  return new Response('Method Not Allowed', { status: 405 });
};
