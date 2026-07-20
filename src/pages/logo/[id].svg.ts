import type { APIRoute } from 'astro';
import { PEEK_BASE } from '@/features/mascot/peek/base';
import { LOGOS, gridToSvg, logoToSvg, type LogoId } from '@/features/logos/lib/svg';

export function getStaticPaths() {
  return (Object.keys(LOGOS) as LogoId[]).flatMap((id) => [
    { params: { id } },
    { params: { id: `${id}-dev` } },
  ]);
}

// Serves /logo/<id>.svg — used as a SVG favicon and anywhere an <img> source is needed.
const FAVICON_THEME_STYLE = `
:root { --favicon-fg: #0a0a0a; }
@media (prefers-color-scheme: dark) {
  :root { --favicon-fg: #fafafa; }
}
`;

// Dev-server tabs get the mark on an amber tile so they are instantly
// distinguishable from prod. The solid background reads in both chrome themes,
// so no prefers-color-scheme swap is needed.
const DEV_BG = '#f59e0b';

// The favicon responds to browser chrome theme because tab strips cannot use site CSS.
export const GET: APIRoute = ({ params }) => {
  const requested = params.id ?? '';
  const isDev = requested.endsWith('-dev');
  const id = (isDev ? requested.slice(0, -'-dev'.length) : requested) as LogoId;
  if (!LOGOS[id]) {
    return new Response('Not found', { status: 404 });
  }
  const opts = isDev
    ? { fg: '#0a0a0a', bg: DEV_BG, pad: 1, title: `${id} — buxx.me dev` }
    : { fg: 'var(--favicon-fg)', pad: 1, title: `${id} — buxx.me`, style: FAVICON_THEME_STYLE };
  const svg = id === 'peek'
    ? gridToSvg(PEEK_BASE.base, PEEK_BASE.width, PEEK_BASE.height, {
        ...opts,
        accent: PEEK_BASE.accent,
      })
    : logoToSvg(id, { ...opts, accent: LOGOS[id].accent });
  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
