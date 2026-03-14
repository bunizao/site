import type { APIRoute } from 'astro';
import { NotifyServiceError, requestMoodSubscription } from '@/lib/notify/service';
import { checkRateLimit, createRateLimitHeaders } from '@/lib/security/rate-limit';
import { verifyTurnstileToken } from '@/lib/security/turnstile';

export const prerender = false;

interface SubscribeBody {
  email?: string;
  deliveryMode?: string;
  timezone?: string;
  dailyHour?: number | string | null;
  turnstileToken?: string;
  cfTurnstileResponse?: string;
  captchaToken?: string;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const rateLimit = checkRateLimit(
    request,
    { windowMs: 10 * 60_000, max: 8, prefix: 'api:notify:subscribe' },
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

  let payload: SubscribeBody;
  try {
    payload = (await request.json()) as SubscribeBody;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        ...Object.fromEntries(rateLimitHeaders),
      },
    });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        ...Object.fromEntries(rateLimitHeaders),
      },
    });
  }

  const turnstileToken =
    payload.turnstileToken
    || payload.cfTurnstileResponse
    || payload.captchaToken
    || request.headers.get('cf-turnstile-response')
    || '';

  const turnstileResult = await verifyTurnstileToken({
    request,
    locals,
    token: turnstileToken,
    expectedAction: 'notify_subscribe',
  });
  if (!turnstileResult.ok) {
    const isServiceError = turnstileResult.code === 'verify_unavailable';
    return new Response(
      JSON.stringify({
        error: isServiceError ? 'Turnstile verification unavailable' : 'Turnstile verification failed',
        code: turnstileResult.code,
      }),
      {
        status: isServiceError ? 503 : 400,
        headers: {
          'Content-Type': 'application/json',
          ...Object.fromEntries(rateLimitHeaders),
        },
      }
    );
  }

  try {
    const result = await requestMoodSubscription(
      {
        request,
        locals,
      },
      {
        email: payload.email ?? '',
        deliveryMode: payload.deliveryMode,
        timezone: payload.timezone,
        dailyHour: payload.dailyHour,
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
      return new Response(
        JSON.stringify({
          error: error.message,
          code: error.code,
        }),
        {
          status: error.status,
          headers: {
            'Content-Type': 'application/json',
            ...Object.fromEntries(rateLimitHeaders),
          },
        }
      );
    }

    console.error('Subscription request failed:', error);
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
