import type { APIRoute } from 'astro';
import { confirmMoodSubscription, NotifyServiceError } from '@/lib/notify/service';

export const prerender = false;

function renderHtml(title: string, message: string): Response {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
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
      <h1>${title}</h1>
      <p>${message}</p>
      <p style="margin-top:14px;"><a href="/mood">Go to mood feed</a></p>
    </main>
  </body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') ?? '';

  if (!token) {
    return renderHtml('Invalid link', 'Missing token.');
  }

  try {
    await confirmMoodSubscription({ request, locals }, token);
    return renderHtml('Subscribed', 'Your email subscription is active.');
  } catch (error) {
    if (error instanceof NotifyServiceError) {
      return renderHtml('Subscription failed', error.message);
    }
    return renderHtml('Subscription failed', 'Unexpected error. Please try again later.');
  }
};

export const ALL: APIRoute = async () => {
  return new Response('Method Not Allowed', { status: 405 });
};
