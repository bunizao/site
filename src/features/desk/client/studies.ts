// Small knife studies for the projects: each project's hero, reduced to a
// few slabs of paint. A cube for the CLI tools, a fan of share cards for
// ogis, a typeset page for Attegi, and waves for the proxy rules. Also the
// record the listening tab turns, and the light that sits on it.

import { draw, ellipse, fill, polygon, rect, ring, seedOf, seeded, stroke, vary, type Rand, type Tone } from './knife';

type Study = (ctx: CanvasRenderingContext2D, rand: Rand, w: number, h: number, t: (l: number, c: number, h: number) => Tone) => void;

const groundOf = (ctx: CanvasRenderingContext2D, rand: Rand, w: number, h: number, wall: Tone, table: Tone) => {
  const horizon = h * 0.66;
  ctx.fillStyle = `oklch(${wall.l} ${wall.c} ${wall.h})`;
  ctx.fillRect(0, 0, w, horizon);
  ctx.fillStyle = `oklch(${table.l} ${table.c} ${table.h})`;
  ctx.fillRect(0, horizon, w, h - horizon);
  const flat = { stretch: [3, 5] as [number, number], jitter: 0.04, density: 1.2, hold: 1, under: false };
  fill(ctx, rand, rect(0, 0, w, horizon), { ...flat, size: w * 0.07, tone: () => vary(rand, wall, 0.012, 0.006, 2) });
  fill(ctx, rand, rect(0, horizon, w, h - horizon), { ...flat, size: w * 0.06, tone: () => vary(rand, table, 0.012, 0.006, 2) });
};

const shadow = (ctx: CanvasRenderingContext2D, rand: Rand, cx: number, cy: number, rx: number, ry: number, tone: Tone) =>
  fill(ctx, rand, ellipse(cx, cy, rx, ry), {
    size: rx * 0.14,
    stretch: [2.4, 4],
    jitter: 0.05,
    density: 1.4,
    hold: 0.5,
    under: false,
    tone: () => vary(rand, tone, 0.012, 0.005, 3),
  });

const cube: Study = (ctx, rand, w, h, t) => {
  groundOf(ctx, rand, w, h, t(0.9, 0.035, 80), t(0.84, 0.03, 60));
  const cx = w * 0.5;
  const s = w * 0.2;
  const top = h * 0.3;
  shadow(ctx, rand, cx + s * 0.4, top + s * 2.05, s * 1.25, s * 0.16, t(0.74, 0.04, 60));
  const faces: [[number, number][], Tone, number][] = [
    [[[cx, top], [cx + s, top + s * 0.55], [cx, top + s * 1.1], [cx - s, top + s * 0.55]], t(0.86, 0.12, 85), 0],
    [[[cx - s, top + s * 0.55], [cx, top + s * 1.1], [cx, top + s * 2.1], [cx - s, top + s * 1.55]], t(0.7, 0.15, 65), Math.PI / 2],
    [[[cx, top + s * 1.1], [cx + s, top + s * 0.55], [cx + s, top + s * 1.55], [cx, top + s * 2.1]], t(0.52, 0.13, 50), Math.PI / 2],
  ];
  for (const [points, tone, angle] of faces) {
    fill(ctx, rand, polygon(points), { size: s * 0.16, stretch: [1.6, 3], angle, jitter: 0.25, density: 2.4, hold: 0.88, tone: () => vary(rand, tone, 0.025, 0.012, 4) });
  }
};

const carousel: Study = (ctx, rand, w, h, t) => {
  groundOf(ctx, rand, w, h, t(0.86, 0.04, 290), t(0.88, 0.02, 70));
  const cw = w * 0.36;
  const ch = cw * 0.56;
  shadow(ctx, rand, w * 0.54, h * 0.79, w * 0.3, h * 0.03, t(0.78, 0.03, 60));
  const cards: [number, number, number, Tone][] = [
    [w * 0.33, h * 0.42, -0.16, t(0.62, 0.12, 255)],
    [w * 0.5, h * 0.38, 0.02, t(0.74, 0.13, 350)],
    [w * 0.66, h * 0.44, 0.17, t(0.84, 0.13, 92)],
  ];
  for (const [x, y, angle, band] of cards) {
    const corner = (dx: number, dy: number): [number, number] => [x + dx * Math.cos(angle) - dy * Math.sin(angle), y + dx * Math.sin(angle) + dy * Math.cos(angle)];
    const card = polygon([corner(-cw / 2, -ch / 2), corner(cw / 2, -ch / 2), corner(cw / 2, ch / 2), corner(-cw / 2, ch / 2)]);
    fill(ctx, rand, card, { size: cw * 0.08, stretch: [2, 3.6], angle, jitter: 0.08, density: 2.4, hold: 0.9, tone: () => vary(rand, t(0.97, 0.01, 90), 0.012, 0.004, 4) });
    const strip = polygon([corner(-cw / 2, -ch / 2), corner(cw / 2, -ch / 2), corner(cw / 2, -ch / 6), corner(-cw / 2, -ch / 6)]);
    fill(ctx, rand, strip, { size: cw * 0.06, stretch: [2, 4], angle, jitter: 0.05, density: 2.4, hold: 0.95, tone: () => vary(rand, band, 0.03, 0.012, 4) });
    const [lx, ly] = corner(-cw * 0.36, ch * 0.12);
    draw(ctx, stroke(rand, lx, ly, angle, cw * 0.5, ch * 0.1, t(0.4, 0.02, 260)));
  }
};

const tour: Study = (ctx, rand, w, h, t) => {
  groundOf(ctx, rand, w, h, t(0.88, 0.03, 40), t(0.85, 0.025, 50));
  const x = w * 0.28;
  const y = h * 0.14;
  const pw = w * 0.44;
  const ph = h * 0.7;
  shadow(ctx, rand, x + pw * 0.62, y + ph + h * 0.02, pw * 0.6, h * 0.025, t(0.75, 0.03, 50));
  fill(ctx, rand, rect(x, y, pw, ph), { size: pw * 0.07, stretch: [2, 4], jitter: 0.05, density: 2.4, hold: 0.95, tone: () => vary(rand, t(0.24, 0.012, 260), 0.02, 0.005, 6) });
  draw(ctx, stroke(rand, x + pw * 0.12, y + ph * 0.14, 0, pw * 0.56, ph * 0.06, t(0.95, 0.01, 90)));
  for (let row = 0; row < 7; row++) {
    const length = pw * (0.5 + rand() * 0.26);
    const rowY = y + ph * (0.3 + row * 0.085);
    draw(ctx, stroke(rand, x + pw * 0.12 + (row % 3 === 1 ? pw * 0.06 : 0), rowY, 0, length, ph * 0.022, row % 3 === 1 ? t(0.72, 0.1, 165) : t(0.78, 0.01, 250)));
  }
};

const waves: Study = (ctx, rand, w, h, t) => {
  groundOf(ctx, rand, w, h, t(0.9, 0.025, 200), t(0.86, 0.02, 75));
  const bands: [number, Tone][] = [
    [0.36, t(0.82, 0.07, 190)],
    [0.5, t(0.7, 0.1, 185)],
    [0.64, t(0.58, 0.1, 190)],
    [0.78, t(0.46, 0.08, 200)],
  ];
  for (const [at, tone] of bands) {
    const base = h * at;
    const amp = h * 0.05;
    const wave = (x: number) => base + Math.sin((x / w) * Math.PI * 2.4 + at * 9) * amp;
    const path = new Path2D();
    path.moveTo(0, wave(0) - h * 0.06);
    for (let x = 0; x <= w; x += w / 24) path.lineTo(x, wave(x) - h * 0.06);
    for (let x = w; x >= 0; x -= w / 24) path.lineTo(x, wave(x) + h * 0.06);
    path.closePath();
    fill(ctx, rand, { path, box: [0, base - amp - h * 0.06, w, amp * 2 + h * 0.12] }, {
      size: h * 0.04,
      stretch: [2.4, 4.4],
      jitter: 0.08,
      density: 2.2,
      hold: 0.7,
      angleAt: (x) => Math.atan(Math.cos((x / w) * Math.PI * 2.4 + at * 9) * ((amp * Math.PI * 2.4) / w)),
      tone: () => vary(rand, tone, 0.025, 0.012, 5),
    });
  }
};

// A record seen from above, on a clear ground. The middle is left for the
// cover of the song, which sits over it as an image.
const vinyl: Study = (ctx, rand, w, _h, t) => {
  const c = w / 2;
  const r = w * 0.49;
  const around = (x: number, y: number) => Math.atan2(y - c, x - c) + Math.PI / 2;
  fill(ctx, rand, ellipse(c, c, r, r), {
    size: r * 0.09,
    stretch: [2, 3.4],
    jitter: 0.1,
    density: 2.4,
    hold: 0.97,
    angleAt: around,
    tone: () => vary(rand, t(0.19, 0.012, 280), 0.025, 0.006, 10),
  });
  for (const [outer, inner, l] of [[0.93, 0.78, 0.3], [0.7, 0.56, 0.27], [0.5, 0.4, 0.29]] as const) {
    fill(ctx, rand, ring(c, c, r * outer, r * inner), {
      size: r * 0.03,
      stretch: [4, 7],
      jitter: 0.04,
      density: 0.6,
      hold: 1,
      under: false,
      angleAt: around,
      tone: () => vary(rand, { ...t(l, 0.012, 275), a: 0.7 }, 0.03, 0.006, 10),
    });
  }
  fill(ctx, rand, ellipse(c, c, r * 0.34, r * 0.34), {
    size: r * 0.06,
    stretch: [1.4, 2.4],
    jitter: 0.6,
    density: 2,
    hold: 0.95,
    tone: () => vary(rand, t(0.82, 0.13, 85), 0.02, 0.01, 5),
  });
};

// Two arcs of light that stay put while the record turns under them.
const shine: Study = (ctx, rand, w) => {
  const c = w / 2;
  const r = w * 0.49;
  for (const centre of [-2.2, 0.94]) {
    for (let i = 0; i < 9; i++) {
      const at = centre + (rand() - 0.5) * 0.5;
      const reach = r * (0.5 + rand() * 0.42);
      const x = c + Math.cos(at) * reach;
      const y = c + Math.sin(at) * reach;
      draw(ctx, stroke(rand, x, y, at + Math.PI / 2, r * (0.12 + rand() * 0.16), r * (0.02 + rand() * 0.03), { l: 1, c: 0, h: 0, a: 0.08 + rand() * 0.1 }, 0.3));
    }
  }
};

const STUDIES: Record<string, Study> = { cube, carousel, tour, waves, vinyl, shine };

const shade = (night: boolean) => (l: number, c: number, h: number): Tone => (night ? { l: 0.12 + l * 0.6, c: c * 0.85, h } : { l, c, h });

/** One study, painted from the origin into a w × h box. */
export function paintStudy(ctx: CanvasRenderingContext2D, kind: string, w: number, h: number, night: boolean, seed: number) {
  STUDIES[kind]?.(ctx, seeded(seed), w, h, shade(night));
}

export function paintStudies(root: ParentNode, night: boolean) {
  const t = shade(night);
  root.querySelectorAll<HTMLCanvasElement>('canvas[data-study]').forEach((canvas) => {
    const study = STUDIES[canvas.dataset.study ?? ''];
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!study || !width || !height) return;
    const scale = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(scale, scale);
    study(ctx, seeded(seedOf(canvas.dataset.seed ?? '')), width, height, t);
    canvas.dataset.painted = night ? 'night' : 'day';
  });
  // The record wears the cover of whatever the listening card shows now.
  const label = root.querySelector<HTMLImageElement>('[data-vinyl-label]');
  const cover = root.querySelector<HTMLImageElement>('[data-listening-artwork]');
  if (label && cover?.src && !cover.src.startsWith('data:')) {
    label.src = cover.currentSrc || cover.src;
    label.hidden = false;
  }
}
