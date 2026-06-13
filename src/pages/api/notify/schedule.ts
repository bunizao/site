import type { APIRoute } from 'astro';
import { getNotifyConfig } from '@/features/notify/server/env';
import { createTelegramMoodSource } from '@/features/mood/server/notify-source';
import {
  dispatchScheduledMoodNotifications,
  isAuthorizedSecret,
  NotifyServiceError,
} from '@/features/notify/server/service';
import { checkRateLimit, createRateLimitHeaders } from '@/lib/security/rate-limit';

export const prerender = false;

function unauthorized(rateLimitHeaders?: Headers): Response {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (rateLimitHeaders) {
    rateLimitHeaders.forEach((value, key) => {
      headers.set(key, value);
    });
  }

  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers,
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
  const rateLimit = checkRateLimit(
    request,
    { windowMs: 60_000, max: 40, prefix: 'api:notify:schedule' },
    locals
  );
  const rateLimitHeaders = createRateLimitHeaders(rateLimit);
  if (!rateLimit.allowed) {
    return new Response(JSON.stringify({ error: 'Too Many Requests' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        ...Object.fromEntries(rateLimitHeaders),
      },
    });
  }

  if (!isAuthorizedForSchedule(request, locals)) {
    return unauthorized(rateLimitHeaders);
  }

  try {
    const result = await dispatchScheduledMoodNotifications({ request, locals }, {
      moodSource: createTelegramMoodSource(),
    });
    return new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json',
        ...Object.fromEntries(rateLimitHeaders),
      },
    });
  } catch (error) {
    if (error instanceof NotifyServiceError) {
      return new Response(JSON.stringify({ error: error.message, code: error.code }), {
        status: error.status,
        headers: {
          'Content-Type': 'application/json',
          ...Object.fromEntries(rateLimitHeaders),
        },
      });
    }

    console.error('Schedule process failed:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...Object.fromEntries(rateLimitHeaders),
      },
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
