import type { APIRoute } from 'astro';
import { NotifyServiceError, unsubscribeMoodSubscription } from '@/lib/notify/service';
import { checkRateLimit, createRateLimitHeaders } from '@/lib/security/rate-limit';

export const prerender = false;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderHtml(title: string, message: string, rateLimitHeaders?: Headers): Response {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; margin: 0; background: #f5f5f5; color: #111; }
      .card { max-width: 560px; margin: 64px auto; background: #fff; border-radius: 14px; padding: 28px; box-shadow: 0 8px 30px rgba(0,0,0,.08); }
      h1 { margin: 0 0 12px; font-size: 24px; }
      p { margin: 0; line-height: 1.6; }
      a { color: #111; }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>${safeTitle}</h1>
      <p>${safeMessage}</p>
      <p style="margin-top:14px;"><a href="/mood">Go to mood feed</a></p>
    </main>
  </body>
</html>`;

  const headers = new Headers({ 'Content-Type': 'text/html; charset=utf-8' });
  if (rateLimitHeaders) {
    rateLimitHeaders.forEach((value, key) => {
      headers.set(key, value);
    });
  }

  return new Response(html, {
    headers,
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

  const url = new URL(request.url);
  const token = url.searchParams.get('token') ?? '';

  if (!token) {
    return renderHtml('Invalid link', 'Missing token.', rateLimitHeaders);
  }

  try {
    await unsubscribeMoodSubscription({ request, locals }, token);
    return renderHtml(
      'Unsubscribed',
      'You will no longer receive mood notifications.',
      rateLimitHeaders
    );
  } catch (error) {
    if (error instanceof NotifyServiceError) {
      return renderHtml('Unsubscribe failed', error.message, rateLimitHeaders);
    }
    return renderHtml(
      'Unsubscribe failed',
      'Unexpected error. Please try again later.',
      rateLimitHeaders
    );
  }
};

export const ALL: APIRoute = async () => {
  return new Response('Method Not Allowed', { status: 405 });
};
