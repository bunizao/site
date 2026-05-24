import type { APIRoute } from 'astro';
import { confirmMoodSubscription, NotifyServiceError } from '@/features/notify/server/service';
import { checkRateLimit, createRateLimitHeaders } from '@/lib/security/rate-limit';
import { renderNotifyPage } from '@/features/notify/server/page-template';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const rateLimit = checkRateLimit(
    request,
    { windowMs: 10 * 60_000, max: 30, prefix: 'api:notify:confirm' },
    locals
  );
  const rateLimitHeaders = createRateLimitHeaders(rateLimit);
  if (!rateLimit.allowed) {
    return new Response('Too Many Requests', { status: 429, headers: rateLimitHeaders });
  }

  const url = new URL(request.url);
  const token = url.searchParams.get('token') ?? '';

  if (!token) {
    return renderNotifyPage({
      label: 'subscription',
      title: 'That link looks off.',
      message: 'The confirmation link is missing a token. Try opening it again from the email, or grab a fresh one.',
      status: 'error',
      rateLimitHeaders,
    });
  }

  try {
    await confirmMoodSubscription({ request, locals }, token);
    return renderNotifyPage({
      label: 'subscription',
      title: 'You’re in.',
      message: 'Mood updates will start landing in your inbox. Welcome aboard.',
      status: 'success',
      enableCongratsFx: true,
      rateLimitHeaders,
    });
  } catch (error) {
    const message = error instanceof NotifyServiceError
      ? error.message
      : 'Something went sideways on our end. Try again in a minute.';
    return renderNotifyPage({
      label: 'subscription',
      title: 'Couldn’t confirm that.',
      message,
      status: 'error',
      rateLimitHeaders,
    });
  }
};

export const ALL: APIRoute = async () => {
  return new Response('Method Not Allowed', { status: 405 });
};
