import type { APIRoute } from 'astro';
import { LOGOS, logoToSvg, type LogoId } from '@/features/logos/lib/svg';

export function getStaticPaths() {
  return (Object.keys(LOGOS) as LogoId[]).map((id) => ({ params: { id } }));
}

// Serves /logo/<id>.svg — used as a SVG favicon and anywhere an <img> source is needed.
// Solid black body so it renders crisply in browser tab strips on both themes
// (the site's monochrome system inverts via CSS, but tab chrome doesn't).
export const GET: APIRoute = ({ params }) => {
  const id = params.id as LogoId;
  if (!LOGOS[id]) {
    return new Response('Not found', { status: 404 });
  }
  const svg = logoToSvg(id, {
    fg: '#0a0a0a',
    accent: LOGOS[id].accent,
    pad: 1,
    title: `${id} — buxx.me`,
  });
  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
