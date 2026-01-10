import type { APIRoute } from 'astro';

// Whitelist of allowed Telegram-related domains
const ALLOWED_DOMAINS = [
  't.me',
  'telegram.org',
  'telegram.me',
  'telegram.dog',
  'cdn-telegram.org',
  'cdn1.telegram-cdn.org',
  'cdn2.telegram-cdn.org',
  'cdn3.telegram-cdn.org',
  'cdn4.telegram-cdn.org',
  'cdn5.telegram-cdn.org',
  'telesco.pe',
];

export const prerender = false;

export const GET: APIRoute = async ({ request, params, url }) => {
  try {
    const targetUrl = params.url + url.search;
    const target = new URL(targetUrl);

    // Check if the domain is in the whitelist
    const isAllowed = ALLOWED_DOMAINS.some(
      (domain) => target.hostname === domain || target.hostname.endsWith(`.${domain}`)
    );

    if (!isAllowed) {
      return new Response('Forbidden', { status: 403 });
    }

    // Forward the request to the target URL
    const headers = new Headers();
    headers.set('User-Agent', request.headers.get('User-Agent') || 'Mozilla/5.0');
    headers.set('Accept', request.headers.get('Accept') || '*/*');
    headers.set('Accept-Language', request.headers.get('Accept-Language') || 'en-US,en;q=0.9');

    const response = await fetch(target.toString(), {
      headers,
      redirect: 'follow',
    });

    if (!response.ok) {
      return new Response('Failed to fetch resource', { status: response.status });
    }

    // Create response with appropriate headers
    const responseHeaders = new Headers();
    const contentType = response.headers.get('Content-Type');
    if (contentType) {
      responseHeaders.set('Content-Type', contentType);
    }

    // Cache for 1 day
    responseHeaders.set('Cache-Control', 'public, max-age=86400, s-maxage=86400');

    return new Response(response.body, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Static proxy error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
};
