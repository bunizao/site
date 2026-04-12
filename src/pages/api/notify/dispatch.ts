import type { APIRoute } from 'astro';
import { getNotifyConfig } from '@/features/notify/server/env';
import {
  dispatchMoodNotification,
  isAuthorizedSecret,
  NotifyServiceError,
} from '@/features/notify/server/service';
import type { DeliveryMode } from '@/features/notify/server/types';
import { checkRateLimit, createRateLimitHeaders } from '@/lib/security/rate-limit';

export const prerender = false;

interface DispatchBody {
  postId?: string;
  force?: boolean;
  deliveryModes?: DeliveryMode[];
}

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

export const POST: APIRoute = async ({ request, locals }) => {
  const rateLimit = checkRateLimit(
    request,
    { windowMs: 60_000, max: 20, prefix: 'api:notify:dispatch' },
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

  const config = getNotifyConfig({ locals });

  if (!config.dispatchSecret || !isAuthorizedSecret(request, config.dispatchSecret)) {
    return unauthorized(rateLimitHeaders);
  }

  let body: DispatchBody;
  try {
    body = (await request.json()) as DispatchBody;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        ...Object.fromEntries(rateLimitHeaders),
      },
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
        deliveryModes: Array.isArray(body.deliveryModes) ? body.deliveryModes : undefined,
      }
    );

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

    console.error('Dispatch failed:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...Object.fromEntries(rateLimitHeaders),
      },
    });
  }
};

export const ALL: APIRoute = async () => {
  return new Response('Method Not Allowed', { status: 405 });
};
