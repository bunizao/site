import type { APIRoute } from 'astro';
import { confirmMoodSubscription, NotifyServiceError } from '@/lib/notify/service';
import { checkRateLimit, createRateLimitHeaders } from '@/lib/security/rate-limit';
import { renderNotifyPage } from '@/lib/notify/page-template';

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
      title: 'Invalid link',
      message: 'The confirmation link is missing a required token.',
      status: 'error',
      rateLimitHeaders,
    });
  }

  try {
    await confirmMoodSubscription({ request, locals }, token);
    return renderNotifyPage({
      label: 'subscription',
      title: 'Subscribed',
      message: 'Your email subscription is now active. You will receive mood notifications.',
      status: 'success',
      rateLimitHeaders,
    });
  } catch (error) {
    const message = error instanceof NotifyServiceError
      ? error.message
      : 'Unexpected error. Please try again later.';
    return renderNotifyPage({
      label: 'subscription',
      title: 'Subscription failed',
      message,
      status: 'error',
      rateLimitHeaders,
    });
  }
};

export const ALL: APIRoute = async () => {
  return new Response('Method Not Allowed', { status: 405 });
};
