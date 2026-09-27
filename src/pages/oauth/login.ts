import type { APIRoute } from 'astro';

export const prerender = false;

const DEFAULT_NEXT = '/dev/portal';

// Resolve first, then compare origins: URL parsing strips tab/CR/LF and
// normalizes backslashes, so string checks on the raw value can be bypassed.
function resolveNext(value: string | null, origin: string): URL {
  const target = URL.parse(value?.trim() || DEFAULT_NEXT, origin);
  return target?.origin === origin ? target : new URL(DEFAULT_NEXT, origin);
}

export const GET: APIRoute = ({ url }) => {
  const target = resolveNext(url.searchParams.get('next'), url.origin);
  return new Response(null, {
    status: 302,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      Location: target.toString(),
    },
  });
};
