import type { APIRoute } from 'astro';
import {
  jsonBadRequest,
  jsonError,
  jsonOk,
  jsonTooManyRequests,
} from '@/lib/http/json-response';
import { withRateLimit } from '@/lib/http/rate-limited';
import { NotifyServiceError, requestMoodSubscription } from '@/features/notify/server/service';
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
  const rateLimit = withRateLimit(
    request,
    { windowMs: 10 * 60_000, max: 8, prefix: 'api:notify:subscribe' },
    locals
  );
  if (!rateLimit.allowed) {
    return jsonTooManyRequests(rateLimit.headers);
  }

  let payload: SubscribeBody;
  try {
    payload = (await request.json()) as SubscribeBody;
  } catch {
    return jsonBadRequest('Invalid JSON body', rateLimit.headers);
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return jsonBadRequest('Invalid JSON body', rateLimit.headers);
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
    return jsonError(
      isServiceError ? 503 : 400,
      isServiceError ? 'Turnstile verification unavailable' : 'Turnstile verification failed',
      rateLimit.headers,
      {
        code: turnstileResult.code,
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

    return jsonOk(result, rateLimit.headers);
  } catch (error) {
    if (error instanceof NotifyServiceError) {
      return jsonError(
        error.status,
        error.message,
        rateLimit.headers,
        {
          code: error.code,
        }
      );
    }

    console.error('Subscription request failed:', error);
    return jsonError(500, 'Internal Server Error', rateLimit.headers);
  }
};

export const ALL: APIRoute = async () => {
  return new Response('Method Not Allowed', { status: 405 });
};
