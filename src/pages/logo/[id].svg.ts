import type { APIRoute } from 'astro';
import { LOGOS, logoToSvg, type LogoId } from '@/features/logos/lib/svg';

export function getStaticPaths() {
  return (Object.keys(LOGOS) as LogoId[]).map((id) => ({ params: { id } }));
}

// Serves /logo/<id>.svg — used as a SVG favicon and anywhere an <img> source is needed.
const FAVICON_THEME_STYLE = `
:root { --favicon-fg: #0a0a0a; }
@media (prefers-color-scheme: dark) {
  :root { --favicon-fg: #fafafa; }
}
`;

// The favicon responds to browser chrome theme because tab strips cannot use site CSS.
export const GET: APIRoute = ({ params }) => {
  const id = params.id as LogoId;
  if (!LOGOS[id]) {
    return new Response('Not found', { status: 404 });
  }
  const svg = logoToSvg(id, {
    fg: 'var(--favicon-fg)',
    accent: LOGOS[id].accent,
    pad: 1,
    title: `${id} — buxx.me`,
    style: FAVICON_THEME_STYLE,
  });
  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
