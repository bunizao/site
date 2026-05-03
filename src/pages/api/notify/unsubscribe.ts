import type { APIRoute } from 'astro';
import {
  NotifyServiceError,
  previewUnsubscribeToken,
  readNotifyTokenFromRequest,
  unsubscribeMoodSubscription,
} from '@/features/notify/server/service';
import { checkRateLimit, createRateLimitHeaders } from '@/lib/security/rate-limit';
import { renderNotifyPage } from '@/features/notify/server/page-template';

export const prerender = false;

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderTokenError(rateLimitHeaders: Headers, message: string): Response {
  return renderNotifyPage({
    label: 'unsubscribe',
    title: 'Invalid link',
    message,
    status: 'error',
    rateLimitHeaders,
  });
}

export const GET: APIRoute = async ({ request, locals }) => {
  const rateLimit = checkRateLimit(
    request,
    { windowMs: 10 * 60_000, max: 30, prefix: 'api:notify:unsubscribe' },
    locals
  );
  const rateLimitHeaders = createRateLimitHeaders(rateLimit);
  if (!rateLimit.allowed) {
    return new Response('Too Many Requests', { status: 429, headers: rateLimitHeaders });
  }

  const token = await readNotifyTokenFromRequest(request);
  if (!token) {
    return renderTokenError(rateLimitHeaders, 'The unsubscribe link is missing a required token.');
  }

  try {
    const email = previewUnsubscribeToken({ request, locals }, token);

    return renderNotifyPage({
      label: 'unsubscribe',
      title: 'Confirm unsubscribe',
      message: `Stop mood notifications for ${email}? This page no longer unsubscribes on load.`,
      status: 'info',
      actionsHtml: [
        '<form method="post" action="" style="margin: 0;">',
        `  <input type="hidden" name="token" value="${escapeAttr(token)}" />`,
        '  <button type="submit" class="button">Unsubscribe</button>',
        '</form>',
        '<a href="/mood" class="button button--ghost">Keep subscription</a>',
      ].join(''),
      rateLimitHeaders,
    });
  } catch (error) {
    const message = error instanceof NotifyServiceError
      ? error.message
      : 'Unexpected error. Please try again later.';
    return renderTokenError(rateLimitHeaders, message);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const rateLimit = checkRateLimit(
    request,
    { windowMs: 10 * 60_000, max: 30, prefix: 'api:notify:unsubscribe' },
    locals
  );
  const rateLimitHeaders = createRateLimitHeaders(rateLimit);
  if (!rateLimit.allowed) {
    return new Response('Too Many Requests', { status: 429, headers: rateLimitHeaders });
  }

  const token = await readNotifyTokenFromRequest(request);
  if (!token) {
    return renderTokenError(rateLimitHeaders, 'The unsubscribe request is missing a required token.');
  }

  try {
    await unsubscribeMoodSubscription({ request, locals }, token);
    return renderNotifyPage({
      label: 'unsubscribe',
      title: 'Unsubscribed',
      message: 'You will no longer receive mood notifications.',
      status: 'success',
      rateLimitHeaders,
    });
  } catch (error) {
    const message = error instanceof NotifyServiceError
      ? error.message
      : 'Unexpected error. Please try again later.';
    return renderNotifyPage({
      label: 'unsubscribe',
      title: 'Unsubscribe failed',
      message,
      status: 'error',
      rateLimitHeaders,
    });
  }
};

export const ALL: APIRoute = async () => {
  return new Response('Method Not Allowed', { status: 405 });
};
