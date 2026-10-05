import type { APIRoute } from 'astro';

export const prerender = false;

// A locked docs page signs the owner in through here: Access guards /dev, and
// the cookie it sets lets the page recognise them on the way back. Only docs
// pages are accepted as `next`, so this never redirects off the site.
const DOCS_RETURN_PATH = /^\/docs\/[a-z0-9][a-z0-9/-]*$/;

export const ALL: APIRoute = ({ url }) => {
  const next = url.searchParams.get('next');
  return new Response(null, {
    status: 302,
    headers: {
      Location: next && DOCS_RETURN_PATH.test(next) ? next : '/dev/portal',
    },
  });
};
