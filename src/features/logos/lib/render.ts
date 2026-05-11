import type { Grid } from '../data/types';

export type RenderOptions = {
  size?: number;            // pixel size of rendered SVG (square if no aspect override)
  fg?: string;              // body color, default 'currentColor'
  accent?: string;          // accent color, default to logo's accent
  bg?: string;              // bg color, default 'transparent'
  pad?: number;             // padding cells around the grid, default 0
  rounded?: boolean;        // tiny rounding on cells (default false)
  className?: string;
  title?: string;           // adds <title> for a11y (also sets role="img")
  style?: string;           // inline SVG stylesheet
};

export type PaletteRenderOptions = RenderOptions & {
  extraPalette?: Record<number, string>;
};

// Render a grid as an SVG string. Cells with value 1 use fg, 3 uses accent, and 0/2 stay transparent.
export function gridToSvg(
  grid: Grid,
  width: number,
  height: number,
  opts: RenderOptions = {},
): string {
  const {
    size,
    fg = 'currentColor',
    accent,
    bg = 'transparent',
    pad = 0,
    rounded = false,
    className,
    title,
    style,
  } = opts;

  const w = width + pad * 2;
  const h = height + pad * 2;
  const r = rounded ? 0.06 : 0;

  const cells: string[] = [];
  for (let y = 0; y < height; y++) {
    const row = grid[y];
    for (let x = 0; x < width; x++) {
      const v = row[x];
      if (v === 1 || v === 3) {
        const fill = v === 3 && accent ? accent : v === 3 ? 'var(--logo-accent, currentColor)' : fg;
        cells.push(
          `<rect x="${x + pad}" y="${y + pad}" width="1" height="1"${r ? ` rx="${r}" ry="${r}"` : ''} fill="${fill}"/>`,
        );
      }
    }
  }

  const sizeAttr = size ? ` width="${size}" height="${(size * h) / w}"` : '';
  const classAttr = className ? ` class="${className}"` : '';
  const a11y = title
    ? ` role="img" aria-label="${escapeAttr(title)}"`
    : ' aria-hidden="true"';
  const bgRect = bg !== 'transparent' ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : '';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg"${sizeAttr}${classAttr}${a11y} viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">` +
    (title ? `<title>${escapeText(title)}</title>` : '') +
    (style ? `<style>${style}</style>` : '') +
    bgRect +
    cells.join('') +
    `</svg>`
  );
}

export function paletteGridToSvg(
  grid: Grid,
  width: number,
  height: number,
  opts: PaletteRenderOptions = {},
): string {
  const {
    size,
    fg = 'currentColor',
    accent,
    bg = 'transparent',
    pad = 0,
    rounded = false,
    className,
    title,
    style,
    extraPalette = {},
  } = opts;

  const w = width + pad * 2;
  const h = height + pad * 2;
  const r = rounded ? 0.06 : 0;

  const cells: string[] = [];
  for (let y = 0; y < height; y++) {
    const row = grid[y];
    for (let x = 0; x < width; x++) {
      const v = row[x];
      if (!v || v === 2) continue;
      const fill = v === 1
        ? fg
        : v === 3
          ? accent ?? 'var(--logo-accent, currentColor)'
          : extraPalette[v];
      if (!fill) continue;
      cells.push(
        `<rect x="${x + pad}" y="${y + pad}" width="1" height="1"${r ? ` rx="${r}" ry="${r}"` : ''} fill="${fill}"/>`,
      );
    }
  }

  const sizeAttr = size ? ` width="${size}" height="${(size * h) / w}"` : '';
  const classAttr = className ? ` class="${className}"` : '';
  const a11y = title
    ? ` role="img" aria-label="${escapeAttr(title)}"`
    : ' aria-hidden="true"';
  const bgRect = bg !== 'transparent' ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : '';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg"${sizeAttr}${classAttr}${a11y} viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">` +
    (title ? `<title>${escapeText(title)}</title>` : '') +
    (style ? `<style>${style}</style>` : '') +
    bgRect +
    cells.join('') +
    `</svg>`
  );
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
