// Paints the site's favicons and OG card with the desk's palette knife.
// Browser entry for scripts/brand/generate.mjs, which bundles it, runs it in
// headless Chromium and writes what window.paintBrand returns into public/.
//
// Every stroke is seeded, so a run on the same Chromium is pixel-identical.

import { NIGHT_TABLE, NIGHT_WALL, PALETTE, TABLE, WALL } from '@/features/desk/client/still-life';
import { paintOver, type Style } from '@/features/desk/client/painterly';
import { css, seeded, type Rand, type Tone } from '@/features/desk/client/knife';
import { PEEK_BASE } from '@/features/mascot/peek/base';

const BODY = 1;
const EYE = 2;
const MOUTH = 3;
const MOUTH_TONE: Tone = { l: 0.62, c: 0.13, h: 25 }; // PEEK_BASE.accent

const mix = (t: Tone, dl: number, dc = 0, dh = 0): Tone => ({ l: t.l + dl, c: Math.max(0, t.c + dc), h: t.h + dh, a: t.a });

function cv(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.round(w);
  c.height = Math.round(h);
  return c;
}
const ctxOf = (c: HTMLCanvasElement) => c.getContext('2d', { willReadFrequently: true })!;

// A blurred fill with no hard edge: the shape is drawn far off-canvas and only its shadow lands.
const AWAY = 20000;
function soft(ctx: CanvasRenderingContext2D, path: Path2D, tone: Tone, blur: number) {
  ctx.save();
  ctx.shadowColor = css(tone);
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = AWAY;
  ctx.translate(-AWAY, 0);
  ctx.fillStyle = '#000';
  ctx.fill(path);
  ctx.restore();
}
const ovalP = (cx: number, cy: number, rx: number, ry: number, rot = 0) => {
  const p = new Path2D();
  p.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
  return p;
};
const rectP = (x: number, y: number, w: number, h: number) => {
  const p = new Path2D();
  p.rect(x, y, w, h);
  return p;
};
function lin(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, stops: [number, Tone][]) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, t] of stops) g.addColorStop(o, css(t));
  return g;
}
// Light across a rounded form, lit from the left.
const turning = (t: Tone): [number, Tone][] => [
  [0, mix(t, -0.03)],
  [0.14, mix(t, 0.05)],
  [0.26, mix(t, 0.085, -0.012)],
  [0.4, mix(t, 0.04)],
  [0.64, mix(t, -0.05, 0.004)],
  [0.84, mix(t, -0.1, 0.006)],
  [0.94, mix(t, -0.065)],
  [1, mix(t, -0.09)],
];

function mottle(ctx: CanvasRenderingContext2D, rand: Rand, region: [number, number, number, number], tones: Tone[], count: number, size: number) {
  const [x, y, w, h] = region;
  ctx.save();
  ctx.clip(rectP(x, y, w, h));
  for (let i = 0; i < count; i++) {
    const r = size * (0.5 + rand());
    const tone = tones[Math.floor(rand() * tones.length)];
    soft(ctx, ovalP(x + rand() * w, y + rand() * h, r * (1.2 + rand()), r * (0.6 + rand() * 0.5), (rand() - 0.5) * 0.6), { ...tone, a: 0.3 + rand() * 0.35 }, r * 0.9);
  }
  ctx.restore();
}

/** The desk's wall over its table, lit from the upper left. `hz` is the table edge as a share of H. */
function roomStudy(ctx: CanvasRenderingContext2D, W: number, H: number, hz: number, night: boolean, seed: number) {
  const rand = seeded(seed);
  const wall = night ? NIGHT_WALL : WALL;
  const table = night ? NIGHT_TABLE : TABLE;
  const Y = H * hz;
  const g = ctx.createRadialGradient(W * 0.05, H * 0.05, 0, W * 0.05, H * 0.05, Math.hypot(W, H) * 1.05);
  g.addColorStop(0, css(mix(wall, 0.035, -0.004)));
  g.addColorStop(0.55, css(wall));
  g.addColorStop(1, css(mix(wall, -0.03, 0.004)));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, Y);
  const s = Math.min(W, H);
  mottle(ctx, rand, [0, 0, W, Y], [mix(wall, 0.03, -0.012, -12), mix(wall, -0.025, 0.012, 14), mix(wall, 0.012, 0.008, -22), mix(wall, 0.05, -0.025, -150)], Math.round((W * Y) / (s * s * 0.02)), s * 0.07);
  ctx.fillStyle = lin(ctx, 0, Y - s * 0.16, 0, Y, [
    [0, { ...mix(wall, -0.03), a: 0 }],
    [1, { ...mix(wall, -0.03), a: 0.6 }],
  ]);
  ctx.fillRect(0, Y - s * 0.16, W, s * 0.16);
  ctx.fillStyle = lin(ctx, 0, Y, 0, H, [
    [0, mix(table, -0.045, 0.006)],
    [0.12, mix(table, -0.015)],
    [0.5, table],
    [1, mix(table, 0.012)],
  ]);
  ctx.fillRect(0, Y, W, H - Y);
  mottle(ctx, rand, [0, Y, W, H - Y], [mix(table, -0.025, 0.01, -14), mix(table, 0.02, -0.005, 14), mix(table, -0.01, 0.012, 160)], Math.round((W * (H - Y)) / (s * s * 0.03)), s * 0.06);
}

/** Long flat blades for wall and table; `k` sets the blade sizes. */
const roomStyle = (k: number, night: boolean): Style => ({
  layers: [
    { size: Math.max(2, 0.042 * k), threshold: 0 },
    { size: Math.max(2, 0.022 * k), threshold: 5 },
    { size: Math.max(2, 0.011 * k), threshold: 11 },
  ],
  stretch: [1.8, 4.6],
  angle: 0,
  jitter: 0.3,
  grain: 0.75,
  accents: [mix(night ? NIGHT_WALL : WALL, 0, 0.01, 30), mix(night ? NIGHT_WALL : WALL, 0, 0, -26), mix(night ? NIGHT_TABLE : TABLE, 0, 0.01, -20)],
  accentShare: 0.06,
  whiteShare: 0.22,
});

/** Peek's blades: one slab per cell first, then smaller passes where the study disagrees. */
const peekStyle = (cell: number, blades: [number, number, number], spill: number, whiteShare: number): Style => ({
  layers: [
    { size: cell * blades[0], threshold: 0 },
    { size: cell * blades[1], threshold: 24 },
    { size: cell * blades[2], threshold: 18 },
  ],
  stretch: [1.5, 3.2],
  angle: 0,
  jitter: 0.25,
  spill,
  accents: PALETTE,
  accentShare: 0.03,
  whiteShare,
});

/** Draws a study with `fn` on a clear canvas the size of `out`, knifes it, and lays the paint over `out`. */
async function knifeOnto(out: HTMLCanvasElement, fn: (ctx: CanvasRenderingContext2D) => void, style: Style, seed: number, underpaint = false) {
  const study = cv(out.width, out.height);
  fn(ctxOf(study));
  const layer = cv(out.width, out.height);
  const lctx = ctxOf(layer);
  if (underpaint) lctx.drawImage(study, 0, 0);
  await paintOver(lctx, study, [0, 0], style, seeded(seed));
  ctxOf(out).drawImage(layer, 0, 0);
}

/** The path of every cell of one kind in peek's grid, at `cell` pixels a cell. */
const peekCells = (left: number, top: number, cell: number) => (kind: number) => {
  const p = new Path2D();
  PEEK_BASE.base.forEach((row, y) => row.forEach((c, x) => c === kind && p.rect(left + x * cell - 0.5, top + y * cell - 0.5, cell + 1, cell + 1)));
  return p;
};

// --- Favicon -------------------------------------------------------------------

const S = 512;
// The tile's pose: cell size and table edge as shares of the tile, and how many of peek's seven rows show above it.
const POSE = { cell: 0.092, hz: 0.88, rows: 7.12 };

async function iconRoom(tile: HTMLCanvasElement, night: boolean, shadows?: (ctx: CanvasRenderingContext2D) => void) {
  await knifeOnto(
    tile,
    (ctx) => {
      roomStudy(ctx, S, S, POSE.hz, night, 13);
      shadows?.(ctx);
    },
    { ...roomStyle(S * 2.2, night), whiteShare: 0.18 },
    14,
    true,
  );
}

/** Peek behind the table edge, painted on a 512 tile: the source for every size above the tab's. */
async function paintedPeek(night: boolean) {
  const tile = cv(S, S);
  const cell = S * POSE.cell;
  const left = (S - cell * 10) / 2;
  const top = S * POSE.hz - cell * POSE.rows;
  const cells = peekCells(left, top, cell);
  // Day: warm ink with page-white eyes. Night: the head turns cream and the eyes go dark, as the pixel mark flips.
  const ink: Tone = night ? { l: 0.93, c: 0.012, h: 85 } : { l: 0.24, c: 0.012, h: 60 };
  const eye: Tone = night ? { l: 0.27, c: 0.02, h: 250 } : { l: 0.97, c: 0.01, h: 90 };
  await iconRoom(tile, night, (ctx) => {
    const onWall = mix(night ? NIGHT_WALL : WALL, night ? -0.07 : -0.1, 0.014, 8);
    const shadow = new Path2D();
    shadow.addPath(cells(BODY), new DOMMatrix().translate(cell * 0.55, cell * 0.35));
    soft(ctx, shadow, { ...onWall, a: 0.6 }, cell * 0.3);
  });
  await knifeOnto(
    tile,
    (ctx) => {
      ctx.fillStyle = lin(ctx, left, 0, left + cell * 10, 0, turning(ink));
      ctx.fill(cells(BODY));
      ctx.fillStyle = css(MOUTH_TONE);
      ctx.fill(cells(MOUTH));
      ctx.fillStyle = css(eye);
      ctx.fill(cells(EYE));
    },
    peekStyle(cell, [0.95, 0.55, 0.3], S * 0.003, night ? 0.15 : 0.25),
    81,
  );
  // The table's front edge, painted over the sliver of head behind it.
  await knifeOnto(
    tile,
    (ctx) => {
      const table = night ? NIGHT_TABLE : TABLE;
      ctx.fillStyle = lin(ctx, 0, S * POSE.hz, 0, S, [[0, mix(table, -0.03, 0.006)], [0.3, mix(table, -0.005)], [1, mix(table, 0.012)]]);
      ctx.fillRect(0, S * POSE.hz, S, S * (1 - POSE.hz));
    },
    { ...roomStyle(S * 2.2, night), spill: S * 0.004 },
    83,
    true,
  );
  return tile;
}

/**
 * The 32px tab icon. Knife texture is gone at this size, so the cells are
 * snapped to 3px squares, each in the average colour the knife left on the
 * middle of that cell, over the painted room shrunk to 32.
 */
async function tabPeek(night: boolean, painted: HTMLCanvasElement) {
  const room = cv(S, S);
  await iconRoom(room, night);
  const tab = cv(32, 32);
  const t = ctxOf(tab);
  t.drawImage(resize(room, 32), 0, 0);
  const pctx = ctxOf(painted);
  const cell = S * POSE.cell;
  const left = (S - cell * 10) / 2;
  const top = S * POSE.hz - cell * POSE.rows;
  const px = 3;
  const tabLeft = 1;
  const tabTop = Math.round(32 * POSE.hz) - 7 * px;
  PEEK_BASE.base.forEach((row, y) =>
    row.forEach((c, x) => {
      if (!c) return;
      const d = pctx.getImageData(Math.round(left + (x + 0.2) * cell), Math.round(top + (y + 0.2) * cell), Math.round(cell * 0.6), Math.round(cell * 0.6)).data;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let i = 0; i < d.length; i += 4) {
        r += d[i];
        g += d[i + 1];
        b += d[i + 2];
      }
      const n = d.length / 4;
      t.fillStyle = `rgb(${Math.round(r / n)} ${Math.round(g / n)} ${Math.round(b / n)})`;
      t.fillRect(tabLeft + x * px, tabTop + y * px, px, px);
    }),
  );
  return tab;
}

// --- OG card, 1200 × 630, painted at 2x ------------------------------------------

const OW = 1200;
const OH = 630;
const K = 2;

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, font: string, color: string, spacing: number) {
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.letterSpacing = `${spacing}px`;
  ctx.fillText(s, x, y);
  ctx.restore();
}

/** Peek peering over the table edge, with the name set on the table. */
async function ogPeek() {
  const out = cv(OW * K, OH * K);
  const hz = 0.6;
  const W = OW * K;
  const H = OH * K;
  const cell = 26 * K;
  const left = (W - cell * 10) / 2;
  const top = H * hz - cell * 7 - cell * 0.12;
  const cells = peekCells(left, top, cell);
  await knifeOnto(
    out,
    (ctx) => {
      roomStudy(ctx, W, H, hz, false, 23);
      const shadow = new Path2D();
      shadow.addPath(cells(BODY), new DOMMatrix().translate(cell * 0.55, cell * 0.35));
      soft(ctx, shadow, { ...mix(WALL, -0.1, 0.014, 8), a: 0.55 }, cell * 0.35);
    },
    roomStyle(W * 0.5, false),
    24,
    true,
  );
  await knifeOnto(
    out,
    (ctx) => {
      ctx.fillStyle = lin(ctx, left, 0, left + cell * 10, 0, turning({ l: 0.24, c: 0.012, h: 60 }));
      ctx.fill(cells(BODY));
      ctx.fillStyle = css(MOUTH_TONE);
      ctx.fill(cells(MOUTH));
      ctx.fillStyle = css({ l: 0.97, c: 0.01, h: 90 });
      ctx.fill(cells(EYE));
    },
    peekStyle(cell, [0.9, 0.5, 0.28], cell * 0.06, 0.25),
    85,
  );
  await knifeOnto(
    out,
    (ctx) => {
      ctx.fillStyle = lin(ctx, 0, H * hz, 0, H, [[0, mix(TABLE, -0.03, 0.006)], [0.3, mix(TABLE, -0.005)], [1, mix(TABLE, 0.012)]]);
      ctx.fillRect(0, H * hz, W, H * (1 - hz));
      mottle(ctx, seeded(3), [0, H * hz, W, H * (1 - hz)], [mix(TABLE, -0.025, 0.01, -14), mix(TABLE, 0.02, -0.005, 14)], 40, H * 0.06);
    },
    { ...roomStyle(W * 0.5, false), spill: 2 },
    86,
    true,
  );
  const ctx = ctxOf(out);
  ctx.scale(K, K);
  text(ctx, 'Lucian Bu', OW / 2, OH * hz + 112, '600 66px "Space Grotesk"', '#1b1917', -2);
  text(ctx, 'buxx.me', OW / 2, OH * hz + 158, '400 22px "Space Grotesk"', '#857f74', 1.2);
  return out;
}

// --- Output ----------------------------------------------------------------------

/** Halves until close, then one last step: a single big drawImage would alias the knife marks. */
function resize(src: HTMLCanvasElement, size: number) {
  let cur = src;
  while (cur.width / 2 >= size) {
    const half = cv(cur.width / 2, cur.height / 2);
    const h = ctxOf(half);
    h.imageSmoothingQuality = 'high';
    h.drawImage(cur, 0, 0, half.width, half.height);
    cur = half;
  }
  if (cur.width === size) return cur;
  const out = cv(size, Math.round((cur.height / cur.width) * size));
  const o = ctxOf(out);
  o.imageSmoothingQuality = 'high';
  o.drawImage(cur, 0, 0, out.width, out.height);
  return out;
}

declare global {
  interface Window {
    /** Painted files keyed by their path under public/, as data URLs. */
    paintBrand: () => Promise<Record<string, string>>;
  }
}

window.paintBrand = async () => {
  await document.fonts.load('600 66px "Space Grotesk"', 'Lucian Bu');
  const files: Record<string, string> = {};
  for (const night of [false, true]) {
    const painted = await paintedPeek(night);
    files[`favicon-${night ? 'dark' : 'light'}.png`] = (await tabPeek(night, painted)).toDataURL('image/png');
    // iOS home screens and Google results take one icon with no scheme, so only the day tile ships big.
    if (!night) files['apple-touch-icon.png'] = resize(painted, 180).toDataURL('image/png');
  }
  // JPEG: the knife grain makes a 1.4 MB PNG, past what chat apps will preview.
  files['og.jpg'] = resize(await ogPeek(), OW).toDataURL('image/jpeg', 0.9);
  return files;
};
