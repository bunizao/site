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
    title: 'That link looks off.',
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
    return renderTokenError(rateLimitHeaders, 'The unsubscribe link is missing a token. Try opening it again from the email.');
  }

  try {
    const email = previewUnsubscribeToken({ request, locals }, token);

    return renderNotifyPage({
      label: 'unsubscribe',
      title: 'Pause mood updates?',
      message: `We'll stop sending mood emails to ${email}. You can come back any time.`,
      status: 'info',
      actionsHtml: [
        '<div class="actions-row">',
        '  <div class="action-group">',
        '    <form method="post" action="">',
        `      <input type="hidden" name="token" value="${escapeAttr(token)}" />`,
        '      <button type="submit" class="button"><span>Pause updates</span><span class="button-arrow" aria-hidden="true">&rarr;</span></button>',
        '    </form>',
        '    <span class="action-hint">Stop sending mood emails</span>',
        '  </div>',
        '  <div class="action-group">',
        '    <a href="/mood" class="button button--ghost"><span>Keep them coming</span></a>',
        '    <span class="action-hint">Stay subscribed</span>',
        '  </div>',
        '</div>',
      ].join(''),
      rateLimitHeaders,
    });
  } catch (error) {
    const message = error instanceof NotifyServiceError
      ? error.message
      : 'Something went sideways on our end. Try again in a minute.';
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
    return renderTokenError(rateLimitHeaders, 'The unsubscribe request is missing a token.');
  }

  try {
    await unsubscribeMoodSubscription({ request, locals }, token);
    return renderNotifyPage({
      label: 'unsubscribe',
      title: 'Mood updates paused.',
      message: 'No more mood emails will land in this inbox. Come back anytime.',
      status: 'success',
      rateLimitHeaders,
    });
  } catch (error) {
    const message = error instanceof NotifyServiceError
      ? error.message
      : 'Something went sideways on our end. Try again in a minute.';
    return renderNotifyPage({
      label: 'unsubscribe',
      title: 'Couldn’t pause updates.',
      message,
      status: 'error',
      rateLimitHeaders,
    });
  }
};

export const ALL: APIRoute = async () => {
  return new Response('Method Not Allowed', { status: 405 });
};
