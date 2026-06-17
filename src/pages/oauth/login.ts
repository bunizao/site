import type { APIRoute } from 'astro';

export const prerender = false;

function normalizeNext(value: string | null): string {
  const candidate = value?.trim() || '/dev/portal';
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) {
    return '/dev/portal';
  }

  return candidate;
}

export const GET: APIRoute = ({ url }) => {
  const target = new URL(normalizeNext(url.searchParams.get('next')), url.origin);
  return new Response(null, {
    status: 302,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      Location: target.toString(),
    },
  });
};
