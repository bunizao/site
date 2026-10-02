// Paints "Still life with a desk", one thing at a time. Each thing is first
// drawn as a smooth study, its form turned by a window light from the upper
// left, and then painted over with a palette knife that takes its colours
// from the study (painterly.ts): the study is what the thing looks like, the
// knife is how it is painted. The wall, the table and every shadow go on the
// backdrop; each thing gets its own canvas, so it can lift off the table when
// its word in the prose is pointed at. Positions come from
// shared/still-life.ts in canvas widths; `u` turns them into pixels.
//
// The palette is the room's: a powder-blue wall, a pale table, and things
// mixed with white, so the knife's broken colour carries the life. At night
// the room goes dark and the clock and the lamp keep their light. The lamp's
// light is painted apart from the room (paintLight), so it can be switched.

import { ASPECT, CLOCK_FACE, HORIZON, LAMP_BULB, LAMP_PIVOT, RECORD_DISC, WALL_WORK, type Piece, type PieceId } from '@/features/desk/shared/still-life';
import { css, draw, seedOf, seeded, stroke, strokeAt, vary, type Rand, type Tone } from './knife';
import { paintOver, type Style } from './painterly';

/** Paint margin around a thing's box, in canvas widths: strokes overshoot. */
export const BLEED = 0.05;

interface Brush {
  ctx: CanvasRenderingContext2D;
  rand: Rand;
  /** Canvas widths to pixels. */
  U: (v: number) => number;
  /** A colour as the room's light shows it. */
  t: (tone: Tone) => Tone;
  night: boolean;
}

const brush = (ctx: CanvasRenderingContext2D, u: number, night: boolean, seed: number): Brush => ({
  ctx,
  rand: seeded(seed),
  U: (v) => v * u,
  t: (tone) => (night ? { ...tone, l: 0.1 + tone.l * 0.52, c: tone.c * 0.8 } : tone),
  night,
});

const WALL: Tone = { l: 0.855, c: 0.04, h: 246 };
const TABLE: Tone = { l: 0.9, c: 0.02, h: 74 };
const NIGHT_WALL: Tone = { l: 0.3, c: 0.03, h: 250 };
const NIGHT_TABLE: Tone = { l: 0.345, c: 0.02, h: 65 };
const wall = (night: boolean) => (night ? NIGHT_WALL : WALL);
const table = (night: boolean) => (night ? NIGHT_TABLE : TABLE);

// The things' own colours, which the knife now and then carries elsewhere.
const PALETTE: Tone[] = [
  { l: 0.8, c: 0.06, h: 246 },
  { l: 0.84, c: 0.07, h: 18 },
  { l: 0.86, c: 0.1, h: 88 },
  { l: 0.78, c: 0.07, h: 150 },
  { l: 0.78, c: 0.09, h: 45 },
];

// --- Mixing ------------------------------------------------------------------

/** The same paint, lighter or darker, a touch richer or greyer. */
const mix = (tone: Tone, dl: number, dc = 0, dh = 0): Tone => ({ l: tone.l + dl, c: Math.max(0, tone.c + dc), h: tone.h + dh, a: tone.a });

const paint = (b: Brush, tone: Tone) => css(b.t(tone));

function gradient(b: Brush, x0: number, y0: number, x1: number, y1: number, stops: [number, Tone][]) {
  const g = b.ctx.createLinearGradient(b.U(x0), b.U(y0), b.U(x1), b.U(y1));
  for (const [offset, tone] of stops) g.addColorStop(offset, paint(b, tone));
  return g;
}

/**
 * Across a cylinder lit from the upper left: the near flank, a highlight, the
 * turn into shade, and light bounced back up at the far edge.
 */
const turning = (tone: Tone): [number, Tone][] => [
  [0, mix(tone, -0.03)],
  [0.14, mix(tone, 0.05)],
  [0.26, mix(tone, 0.085, -0.012)],
  [0.4, mix(tone, 0.04)],
  [0.64, mix(tone, -0.05, 0.004)],
  [0.84, mix(tone, -0.1, 0.006)],
  [0.94, mix(tone, -0.065)],
  [1, mix(tone, -0.09)],
];

// --- Shapes, in canvas widths --------------------------------------------------

function box(b: Brush, x: number, y: number, w: number, h: number, r = 0) {
  const path = new Path2D();
  if (r) path.roundRect(b.U(x), b.U(y), b.U(w), b.U(h), b.U(r));
  else path.rect(b.U(x), b.U(y), b.U(w), b.U(h));
  return path;
}

function oval(b: Brush, cx: number, cy: number, rx: number, ry: number, rotation = 0) {
  const path = new Path2D();
  path.ellipse(b.U(cx), b.U(cy), b.U(rx), b.U(ry), rotation, 0, Math.PI * 2);
  return path;
}

function shape(b: Brush, points: [number, number][]) {
  const path = new Path2D();
  points.forEach(([x, y], i) => (i ? path.lineTo(b.U(x), b.U(y)) : path.moveTo(b.U(x), b.U(y))));
  path.closePath();
  return path;
}

function fillPath(b: Brush, path: Path2D, style: string | CanvasGradient) {
  b.ctx.fillStyle = style;
  b.ctx.fill(path);
}

// Shadows are drawn as the shadow of a shape held far off the canvas, which
// gives a soft edge in every browser, filter or not.
const AWAY = 20000;

function soft(b: Brush, path: Path2D, tone: Tone, blur: number) {
  const { ctx } = b;
  ctx.save();
  ctx.shadowColor = paint(b, tone);
  ctx.shadowBlur = b.U(blur);
  ctx.shadowOffsetX = AWAY;
  ctx.translate(-AWAY, 0);
  ctx.fillStyle = '#000';
  ctx.fill(path);
  ctx.restore();
}

/** A straight drag of paint from one point to another: for finishing marks. */
function line(b: Brush, x1: number, y1: number, x2: number, y2: number, width: number, tone: Tone, grain = 0.5) {
  const { U, rand, ctx } = b;
  const dx = U(x2 - x1);
  const dy = U(y2 - y1);
  draw(ctx, stroke(rand, U(x1), U(y1), Math.atan2(dy, dx), Math.hypot(dx, dy) / 0.8, U(width), b.t(tone), grain));
}

// --- The plant's leaves ----------------------------------------------------------

interface Leaf {
  outline: Path2D;
  halves: [Path2D, Path2D];
  /** Which half faces the window. */
  lit: 0 | 1;
  rib: Path2D;
  stem: Path2D;
  base: [number, number];
  tip: [number, number];
  depth: number;
}

// Base x, lean from upright and droop toward the tip (degrees), length,
// width, and depth (0 at the back, 1 at the front). Back to front.
const LEAVES: [number, number, number, number, number, number][] = [
  [0.176, -6, 0.235, 0.031, -9, 0],
  [0.19, 15, 0.215, 0.03, 14, 0.1],
  [0.17, -30, 0.2, 0.029, -24, 0.2],
  [0.196, 38, 0.175, 0.028, 26, 0.28],
  [0.166, -54, 0.15, 0.027, -32, 0.45],
  [0.2, 60, 0.15, 0.027, 34, 0.5],
  [0.182, 3, 0.18, 0.033, 6, 0.6],
  [0.17, -76, 0.13, 0.026, -46, 0.78],
  [0.19, 78, 0.125, 0.026, 46, 0.84],
  [0.178, -20, 0.13, 0.031, -14, 0.9],
  [0.187, 24, 0.125, 0.03, 16, 0.96],
];

const SOIL_Y = 0.79;

function leaves(b: Brush): Leaf[] {
  const { U } = b;
  const heading = (degrees: number): [number, number] => [Math.sin((degrees * Math.PI) / 180), -Math.cos((degrees * Math.PI) / 180)];
  return LEAVES.map(([bx, lean, length, width, droop, depth]) => {
    const p0: [number, number] = [bx, SOIL_Y + 0.002];
    const [ax, ay] = heading(lean);
    const p1: [number, number] = [p0[0] + ax * length * 0.55, p0[1] + ay * length * 0.55];
    const [tx, ty] = heading(lean + droop);
    const p2: [number, number] = [p1[0] + tx * length * 0.5, p1[1] + ty * length * 0.5];
    const at = (t: number): [number, number] => [
      (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
      (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1],
    ];
    const slope = (t: number): [number, number] => {
      const dx = 2 * (1 - t) * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]);
      const dy = 2 * (1 - t) * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
      const n = Math.hypot(dx, dy) || 1;
      return [dx / n, dy / n];
    };
    // The stalk takes the first part of the curve; the blade the rest.
    const from = 0.3;
    const steps = 20;
    const rib: [number, number][] = [];
    const left: [number, number][] = [];
    const right: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
      const s = i / steps;
      const t = from + (1 - from) * s;
      const [x, y] = at(t);
      const [dx, dy] = slope(t);
      const half = (width / 2) * Math.sin(Math.PI * s ** 0.8) ** 0.85;
      rib.push([x, y]);
      left.push([x - dy * half, y + dx * half]);
      right.push([x + dy * half, y - dx * half]);
    }
    const path = (points: [number, number][]) => {
      const p = new Path2D();
      points.forEach(([x, y], i) => (i ? p.lineTo(U(x), U(y)) : p.moveTo(U(x), U(y))));
      p.closePath();
      return p;
    };
    const outline = path([...left, ...right.reverse()]);
    right.reverse();
    const halves: [Path2D, Path2D] = [path([...rib, ...left.slice().reverse()]), path([...rib, ...right.slice().reverse()])];
    // The half whose outward side points to the window, up and left.
    const [mx, my] = slope(0.65);
    const lit = -my * -0.6 + mx * -0.8 > 0 ? 0 : 1;
    const ribPath = new Path2D();
    rib.forEach(([x, y], i) => (i ? ribPath.lineTo(U(x), U(y)) : ribPath.moveTo(U(x), U(y))));
    const stem = new Path2D();
    for (let i = 0; i <= 8; i++) {
      const [x, y] = at((from * i) / 8);
      if (i) stem.lineTo(U(x), U(y));
      else stem.moveTo(U(x), U(y));
    }
    return { outline, halves, lit, rib: ribPath, stem, base: p0, tip: p2, depth };
  });
}

// --- Backdrop ------------------------------------------------------------------

/**
 * Soft patches of nearby colours over a region of the study, the way no
 * painted wall is ever one mix: the knife picks them up as broken colour.
 */
function mottle(b: Brush, region: [number, number, number, number], tones: Tone[], count: number, size: number) {
  const { ctx, rand } = b;
  const [x, y, w, h] = region;
  ctx.save();
  ctx.clip(box(b, x, y, w, h));
  for (let i = 0; i < count; i++) {
    const r = size * (0.5 + rand());
    const tone = tones[Math.floor(rand() * tones.length)];
    soft(b, oval(b, x + rand() * w, y + rand() * h, r * (1.2 + rand()), r * (0.6 + rand() * 0.5), (rand() - 0.5) * 0.6), { ...tone, a: 0.3 + rand() * 0.35 }, r * 0.9);
  }
  ctx.restore();
}

/**
 * A thing's shadow on the table: its footprint swept away from the window,
 * right and a little back, as far as the thing is tall, softer as it goes.
 */
function cast(b: Brush, footprint: [number, number, number, number], height: number, tone: Tone) {
  const [cx, cy, rx, ry] = footprint;
  const reach = height * 1.3;
  const sweep = new Path2D();
  for (let i = 0; i <= 18; i++) {
    const t = i / 18;
    sweep.addPath(oval(b, cx + reach * t, cy - height * 0.2 * t, rx * (1 - t * 0.15), ry * (1 + t * 1.6)));
  }
  soft(b, sweep, { ...tone, a: 0.45 }, 0.016);
  soft(b, sweep, { ...tone, a: 0.4 }, 0.005);
  // Where it stands, the table gets almost no light at all.
  soft(b, oval(b, cx + rx * 0.08, cy, rx * 1.03, ry * 1.1), mix(tone, -0.06), 0.003);
}

function backdropStudy(b: Brush) {
  const { ctx, U, night } = b;
  const wallTone = wall(night);
  const tableTone = table(night);
  // The room's light is already in these two; don't shade them twice.
  const raw = (tone: Tone) => css(tone);
  const room = { ...b, t: (tone: Tone) => tone };

  // The wall is lighter near the window, and darkens toward the table.
  const wallLight = ctx.createRadialGradient(U(0.05), U(0.05), 0, U(0.05), U(0.05), U(1.25));
  wallLight.addColorStop(0, raw(mix(wallTone, 0.035, -0.004)));
  wallLight.addColorStop(0.55, raw(wallTone));
  wallLight.addColorStop(1, raw(mix(wallTone, -0.03, 0.004)));
  ctx.fillStyle = wallLight;
  ctx.fillRect(0, 0, U(1), U(HORIZON));
  mottle(room, [0, 0, 1, HORIZON], [mix(wallTone, 0.03, -0.012, -12), mix(wallTone, -0.025, 0.012, 14), mix(wallTone, 0.012, 0.008, -22), mix(wallTone, 0.05, -0.025, -150)], 46, 0.06);
  ctx.fillStyle = gradient(room, 0, HORIZON - 0.12, 0, HORIZON, [
    [0, { ...mix(wallTone, -0.03), a: 0 }],
    [1, { ...mix(wallTone, -0.03), a: 0.6 }],
  ]);
  ctx.fillRect(0, U(HORIZON - 0.12), U(1), U(0.12));

  // The back of the table sits in the wall's shade; the front takes the light.
  ctx.fillStyle = gradient(room, 0, HORIZON, 0, ASPECT, [
    [0, mix(tableTone, -0.045, 0.006)],
    [0.12, mix(tableTone, -0.015)],
    [0.5, tableTone],
    [1, mix(tableTone, 0.012)],
  ]);
  ctx.fillRect(0, U(HORIZON), U(1), U(ASPECT - HORIZON));
  mottle(room, [0, HORIZON, 1, ASPECT - HORIZON], [mix(tableTone, -0.025, 0.01, -14), mix(tableTone, 0.02, -0.005, 14), mix(tableTone, -0.01, 0.012, 160)], 30, 0.05);
  // The table's front edge, where the light turns down it.
  ctx.fillStyle = gradient(room, 0, ASPECT - 0.03, 0, ASPECT, [[0, { ...mix(tableTone, 0.02), a: 0 }], [1, { ...mix(tableTone, 0.025), a: 0.8 }]]);
  ctx.fillRect(0, U(ASPECT - 0.03), U(1), U(0.03));

  // Shadows fall right and a little down, away from the window.
  const onWall = mix(wallTone, night ? -0.07 : -0.105, 0.014, 8);
  const onTable = mix(tableTone, night ? -0.08 : -0.13, 0.018, -10);
  const [fx, fy, fw, fh] = WALL_WORK.box;
  soft(room, box(b, fx + 0.016, fy + 0.016, fw, fh), onWall, 0.011);
  soft(room, box(b, 0.313, 0.318, 0.1, 0.155, 0.006), onWall, 0.009);
  ctx.save();
  ctx.lineWidth = U(0.009);
  ctx.strokeStyle = '#000';
  ctx.shadowColor = raw({ ...onWall, a: 0.7 });
  ctx.shadowBlur = U(0.005);
  ctx.shadowOffsetX = AWAY;
  ctx.translate(-AWAY, 0);
  ctx.beginPath();
  ctx.moveTo(U(0.357), U(0.18));
  ctx.quadraticCurveTo(U(0.372), U(0.24), U(0.358), U(0.302));
  ctx.stroke();
  ctx.restore();
  // The record and its sleeve lean on the wall.
  soft(room, oval(b, RECORD_DISC[0] + 0.024, RECORD_DISC[1] + 0.006, RECORD_DISC[2], RECORD_DISC[2]), onWall, 0.013);
  soft(room, sleeveShape(b, 0.028, -0.004), onWall, 0.014);
  // The plant throws its leaves on the wall, faintly.
  for (const leaf of leaves(b)) {
    const shifted = new Path2D();
    shifted.addPath(leaf.outline, new DOMMatrix().translate(U(0.05), U(0.012)));
    soft(room, shifted, { ...onWall, a: 0.55 }, 0.012);
  }
  // The lamp hangs well off the wall: its shadow is faint and falls far.
  const shade = new Path2D();
  shade.addPath(shadePath(b), new DOMMatrix().translate(U(0.034), U(0.03)));
  soft(room, shade, { ...onWall, a: 0.5 }, 0.016);
  soft(room, box(b, LAMP_X + 0.032, 0, 0.004, 0.1), { ...onWall, a: 0.35 }, 0.004);

  // On the table, each thing's footprint and height.
  cast(room, [0.18, 0.893, 0.046, 0.006], 0.11, onTable);
  cast(room, [0.485, 0.877, 0.112, 0.01], 0.12, onTable);
  cast(room, [0.75, 0.853, 0.12, 0.005], 0.05, onTable);
  cast(room, [0.23, 0.99, 0.13, 0.014], 0.1, onTable);
  cast(room, [0.72, 1.028, 0.05, 0.008], 0.095, onTable);

  // At night the clock is the lamp: a warm pool of its light on the table.
  if (night) soft(room, oval(b, 0.485, 0.895, 0.12, 0.016), { l: 0.5, c: 0.06, h: 55, a: 0.18 }, 0.02);
}

/** The record sleeve's outline, nudged by (dx, dy). */
function sleeveShape(b: Brush, dx = 0, dy = 0) {
  const lean = -0.04;
  const half = 0.122;
  const corner = (x: number, y: number): [number, number] => [
    0.745 + dx + x * Math.cos(lean) - y * Math.sin(lean),
    0.735 + dy + x * Math.sin(lean) + y * Math.cos(lean),
  ];
  return shape(b, [corner(-half, -half), corner(half, -half), corner(half, half), corner(-half, half)]);
}

// --- Studies of the things ---------------------------------------------------------

type Study = (b: Brush) => void;

// A small oil on the wall in a pale oak frame, matted: a cube on a table, the
// first of the projects.
const works: Study = (b) => {
  const { ctx } = b;
  const [x, y, w, h] = WALL_WORK.box;
  const m = 0.012;
  const oak: Tone = { l: 0.76, c: 0.05, h: 72 };
  // Mitred mouldings: the faces turned up and left catch the window.
  const faces: [[number, number][], number][] = [
    [[[x, y], [x + w, y], [x + w - m, y + m], [x + m, y + m]], 0.07],
    [[[x, y], [x + m, y + m], [x + m, y + h - m], [x, y + h]], 0.03],
    [[[x, y + h], [x + m, y + h - m], [x + w - m, y + h - m], [x + w, y + h]], -0.09],
    [[[x + w, y], [x + w, y + h], [x + w - m, y + h - m], [x + w - m, y + m]], -0.12],
  ];
  for (const [points, dl] of faces) fillPath(b, shape(b, points), paint(b, mix(oak, dl)));

  const mat = 0.017;
  const [ix, iy, iw, ih] = [x + m, y + m, w - m * 2, h - m * 2];
  fillPath(b, box(b, ix, iy, iw, ih), gradient(b, ix, iy, ix + iw, iy + ih, [[0, { l: 0.965, c: 0.012, h: 88 }], [1, { l: 0.92, c: 0.014, h: 84 }]]));
  // The frame's own shadow on the mat, along the top and the left.
  ctx.fillStyle = gradient(b, 0, iy, 0, iy + 0.008, [[0, { l: 0.72, c: 0.02, h: 80, a: 0.55 }], [1, { l: 0.9, c: 0.02, h: 80, a: 0 }]]);
  ctx.fill(box(b, ix, iy, iw, 0.008));
  ctx.fillStyle = gradient(b, ix, 0, ix + 0.007, 0, [[0, { l: 0.72, c: 0.02, h: 80, a: 0.45 }], [1, { l: 0.9, c: 0.02, h: 80, a: 0 }]]);
  ctx.fill(box(b, ix, iy, 0.007, ih));

  const [px, py, pw, ph] = [ix + mat, iy + mat, iw - mat * 2, ih - mat * 2];
  const horizon = py + ph * 0.6;
  fillPath(b, box(b, px, py, pw, horizon - py), gradient(b, px, py, px + pw * 0.3, horizon, [[0, { l: 0.86, c: 0.03, h: 78 }], [1, { l: 0.78, c: 0.035, h: 70 }]]));
  fillPath(b, box(b, px, horizon, pw, py + ph - horizon), gradient(b, 0, horizon, 0, py + ph, [[0, { l: 0.68, c: 0.045, h: 60 }], [1, { l: 0.78, c: 0.04, h: 66 }]]));
  // The cube, and its shadow running off to the right.
  const cx = px + pw * 0.46;
  const s = pw * 0.17;
  const top = py + ph * 0.24;
  soft(b, shape(b, [[cx + s, top + s * 1.55], [cx + s * 2.4, top + s * 1.75], [cx + s * 1.4, top + s * 2.25], [cx, top + s * 2.1]]), { l: 0.56, c: 0.05, h: 55 }, 0.005);
  const faceOf = (points: [number, number][], from: Tone, to: Tone, gx: [number, number, number, number]) =>
    fillPath(b, shape(b, points), gradient(b, gx[0], gx[1], gx[2], gx[3], [[0, from], [1, to]]));
  faceOf([[cx, top], [cx + s, top + s * 0.55], [cx, top + s * 1.1], [cx - s, top + s * 0.55]], { l: 0.92, c: 0.11, h: 90 }, { l: 0.85, c: 0.13, h: 84 }, [cx, top, cx, top + s * 1.1]);
  faceOf([[cx - s, top + s * 0.55], [cx, top + s * 1.1], [cx, top + s * 2.1], [cx - s, top + s * 1.55]], { l: 0.76, c: 0.15, h: 66 }, { l: 0.66, c: 0.15, h: 58 }, [cx - s, top + s * 0.6, cx, top + s * 2]);
  faceOf([[cx, top + s * 1.1], [cx + s, top + s * 0.55], [cx + s, top + s * 1.55], [cx, top + s * 2.1]], { l: 0.5, c: 0.12, h: 48 }, { l: 0.56, c: 0.12, h: 50 }, [cx, top + s, cx + s, top + s * 2]);
};

// A card on a lanyard, hung from a nail.
const badge: Study = (b) => {
  const { ctx, U } = b;
  // The lanyard: one loop over the nail, its two sides meeting at the clip.
  const sides: [number, number, number, number, Tone][] = [
    [0.346, 0.334, 0.344, 0.29, { l: 0.56, c: 0.1, h: 262 }],
    [0.354, 0.366, 0.356, 0.29, { l: 0.48, c: 0.095, h: 264 }],
  ];
  ctx.lineCap = 'butt';
  for (const [x0, cx, x1, y1, tone] of sides) {
    ctx.lineWidth = U(0.0105);
    ctx.strokeStyle = paint(b, tone);
    ctx.beginPath();
    ctx.moveTo(U(x0), U(0.172));
    ctx.quadraticCurveTo(U(cx), U(0.235), U(x1), U(y1));
    ctx.stroke();
    // A woven edge catches the light on the window side.
    ctx.lineWidth = U(0.0018);
    ctx.strokeStyle = paint(b, mix(tone, 0.12, -0.02));
    ctx.beginPath();
    ctx.moveTo(U(x0 - 0.004), U(0.174));
    ctx.quadraticCurveTo(U(cx - 0.004), U(0.235), U(x1 - 0.004), U(y1));
    ctx.stroke();
  }
  const nail = ctx.createRadialGradient(U(0.348), U(0.168), 0, U(0.35), U(0.17), U(0.006));
  nail.addColorStop(0, paint(b, { l: 0.9, c: 0.005, h: 250 }));
  nail.addColorStop(1, paint(b, { l: 0.38, c: 0.01, h: 60 }));
  fillPath(b, oval(b, 0.35, 0.17, 0.0058, 0.0058), nail);
  // The clip, a little steel.
  fillPath(b, box(b, 0.3445, 0.286, 0.011, 0.016, 0.003), gradient(b, 0.3445, 0, 0.3555, 0, [[0, { l: 0.9, c: 0.004, h: 250 }], [0.4, { l: 0.72, c: 0.006, h: 250 }], [1, { l: 0.48, c: 0.008, h: 250 }]]));

  const card = box(b, 0.3, 0.305, 0.1, 0.155, 0.006);
  fillPath(b, card, gradient(b, 0.3, 0.305, 0.4, 0.46, [[0, { l: 0.985, c: 0.005, h: 95 }], [1, { l: 0.9, c: 0.01, h: 88 }]]));
  ctx.save();
  ctx.clip(card);
  fillPath(b, box(b, 0.3, 0.305, 0.1, 0.03), gradient(b, 0, 0.305, 0, 0.335, [[0, { l: 0.62, c: 0.085, h: 260 }], [1, { l: 0.52, c: 0.085, h: 262 }]]));
  fillPath(b, box(b, 0.343, 0.311, 0.014, 0.0045, 0.002), paint(b, { l: 0.36, c: 0.03, h: 262 }));
  // The photo: sky behind, a shirt, a face lit from the left, hair.
  fillPath(b, box(b, 0.311, 0.347, 0.033, 0.045), gradient(b, 0, 0.347, 0, 0.392, [[0, { l: 0.88, c: 0.03, h: 232 }], [1, { l: 0.8, c: 0.035, h: 236 }]]));
  ctx.save();
  ctx.clip(box(b, 0.311, 0.347, 0.033, 0.045));
  fillPath(b, oval(b, 0.3275, 0.398, 0.017, 0.013), paint(b, { l: 0.42, c: 0.05, h: 250 }));
  fillPath(b, oval(b, 0.3275, 0.3705, 0.0088, 0.0112), gradient(b, 0.318, 0, 0.337, 0, [[0, { l: 0.86, c: 0.05, h: 60 }], [1, { l: 0.7, c: 0.06, h: 50 }]]));
  ctx.save();
  ctx.clip(box(b, 0.31, 0.35, 0.04, 0.0135));
  fillPath(b, oval(b, 0.3275, 0.3625, 0.0098, 0.0085), paint(b, { l: 0.3, c: 0.03, h: 45 }));
  ctx.restore();
  ctx.restore();
  for (const [y, w, l] of [[0.355, 0.036, 0.36], [0.365, 0.028, 0.62], [0.374, 0.031, 0.62]] as const) {
    fillPath(b, box(b, 0.352, y - 0.0015, w, y === 0.355 ? 0.0035 : 0.0026), paint(b, { l, c: 0.012, h: 250 }));
  }
  // Light across the plastic sleeve of the holder.
  ctx.fillStyle = gradient(b, 0.3, 0.305, 0.4, 0.46, [[0.15, { l: 1, c: 0, h: 0, a: 0 }], [0.32, { l: 1, c: 0, h: 0, a: 0.32 }], [0.42, { l: 1, c: 0, h: 0, a: 0 }]]);
  ctx.fill(card);
  ctx.restore();
  ctx.lineWidth = U(0.0012);
  ctx.strokeStyle = paint(b, { l: 0.78, c: 0.01, h: 88 });
  ctx.stroke(card);
};

// A peace lily in a terracotta pot, for everything that grows on GitHub.
const plant: Study = (b) => {
  const { ctx, U } = b;
  const all = leaves(b);
  const leaf = (one: Leaf) => {
    const tone: Tone = { l: 0.5 + one.depth * 0.18, c: 0.085 + one.depth * 0.02, h: 150 - one.depth * 12 };
    ctx.lineWidth = U(0.0034);
    ctx.lineCap = 'round';
    ctx.strokeStyle = paint(b, mix(tone, 0.04, -0.01, -8));
    ctx.stroke(one.stem);
    one.halves.forEach((half, side) => {
      const own = side === one.lit ? mix(tone, 0.06) : mix(tone, -0.045, 0.004);
      fillPath(b, half, gradient(b, one.base[0], one.base[1], one.tip[0], one.tip[1], [[0.25, mix(own, -0.05)], [0.65, own], [1, mix(own, 0.04, -0.01)]]));
    });
    ctx.lineWidth = U(0.0016);
    ctx.strokeStyle = paint(b, mix(tone, 0.13, -0.03, -10));
    ctx.stroke(one.rib);
  };

  const front = all.filter((one) => one.depth > 0.7);
  all.filter((one) => one.depth <= 0.7).forEach(leaf);

  // The pot: a tapered cylinder under a heavier rim, soil inside it.
  const clay: Tone = { l: 0.7, c: 0.1, h: 46 };
  const body = new Path2D();
  body.moveTo(U(0.122), U(0.806));
  body.lineTo(U(0.238), U(0.806));
  body.lineTo(U(0.226), U(0.893));
  body.ellipse(U(0.18), U(0.893), U(0.046), U(0.006), 0, 0, Math.PI);
  body.closePath();
  fillPath(b, body, gradient(b, 0.122, 0, 0.238, 0, turning(clay)));
  ctx.fillStyle = gradient(b, 0, 0.806, 0, 0.822, [[0, { ...mix(clay, -0.2), a: 0.6 }], [1, { ...mix(clay, -0.2), a: 0 }]]);
  ctx.fill(body);
  const rim = box(b, 0.113, 0.789, 0.134, 0.019, 0.003);
  fillPath(b, rim, gradient(b, 0.113, 0, 0.247, 0, turning(mix(clay, 0.04))));
  fillPath(b, oval(b, 0.18, 0.7895, 0.067, 0.0072), paint(b, mix(clay, 0.1, -0.02)));
  fillPath(b, oval(b, 0.18, 0.79, 0.059, 0.0055), paint(b, { l: 0.36, c: 0.035, h: 50 }));

  front.forEach(leaf);
};

// The record's disc, on a canvas of its own so it can turn while a song
// plays. The window's reflection on its grooves does not turn with it; that
// is laid on the sleeve's canvas, over the disc (FINISH.record).
const disc: Study = (b) => {
  const { ctx, U } = b;
  const [cx, cy, r] = RECORD_DISC;
  const vinyl: Tone = { l: 0.21, c: 0.01, h: 280 };
  const face = oval(b, cx, cy, r, r);
  fillPath(b, face, paint(b, vinyl));
  ctx.lineWidth = U(0.0011);
  for (let ring = 0.044; ring < 0.1; ring += 0.0052) {
    ctx.strokeStyle = paint(b, { l: 0.34, c: 0.01, h: 270, a: 0.55 });
    ctx.beginPath();
    ctx.arc(U(cx), U(cy), U(ring), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.lineWidth = U(0.0022);
  ctx.strokeStyle = paint(b, { l: 0.38, c: 0.01, h: 270 });
  ctx.stroke(oval(b, cx, cy, r - 0.0012, r - 0.0012));
  // The label is lit evenly, so nothing on it gives the turning away but
  // its print: a red band across the top and a line of type under the hole.
  const label = oval(b, cx, cy, 0.034, 0.034);
  const yellow = ctx.createRadialGradient(U(cx), U(cy), 0, U(cx), U(cy), U(0.036));
  yellow.addColorStop(0, paint(b, { l: 0.89, c: 0.09, h: 86 }));
  yellow.addColorStop(1, paint(b, { l: 0.8, c: 0.11, h: 78 }));
  fillPath(b, label, yellow);
  ctx.save();
  ctx.clip(label);
  fillPath(b, box(b, cx - 0.04, cy - 0.04, 0.08, 0.024), paint(b, { l: 0.6, c: 0.15, h: 28 }));
  fillPath(b, box(b, cx - 0.013, cy + 0.011, 0.026, 0.004, 0.001), paint(b, { l: 0.45, c: 0.06, h: 40 }));
  fillPath(b, box(b, cx - 0.008, cy + 0.019, 0.016, 0.003, 0.001), paint(b, { l: 0.55, c: 0.06, h: 50 }));
  ctx.restore();
  ctx.lineWidth = U(0.0012);
  ctx.strokeStyle = paint(b, { l: 0.7, c: 0.1, h: 70 });
  ctx.stroke(oval(b, cx, cy, 0.026, 0.026));
  fillPath(b, oval(b, cx, cy, 0.0035, 0.0035), paint(b, { l: 0.3, c: 0.02, h: 250 }));
};

// The record's sleeve, the disc half out of it: printed card, a sun over a
// line, worn pale at the edges.
const record: Study = (b) => {
  const { ctx, U } = b;
  const sleeve = sleeveShape(b);
  fillPath(b, sleeve, gradient(b, 0.62, 0.61, 0.87, 0.86, [[0, { l: 0.92, c: 0.045, h: 14 }], [0.6, { l: 0.87, c: 0.055, h: 12 }], [1, { l: 0.8, c: 0.06, h: 10 }]]));
  ctx.save();
  ctx.clip(sleeve);
  const sun = ctx.createRadialGradient(U(0.716), U(0.73), 0, U(0.73), U(0.745), U(0.05));
  sun.addColorStop(0, paint(b, { l: 0.9, c: 0.1, h: 80 }));
  sun.addColorStop(1, paint(b, { l: 0.8, c: 0.12, h: 66 }));
  fillPath(b, oval(b, 0.73, 0.745, 0.048, 0.048), sun);
  ctx.lineWidth = U(0.006);
  ctx.strokeStyle = paint(b, { l: 0.7, c: 0.08, h: 18 });
  ctx.beginPath();
  ctx.moveTo(U(0.668), U(0.821));
  ctx.lineTo(U(0.828), U(0.815));
  ctx.stroke();
  // The card's edge, thick on the far side.
  fillPath(b, shape(b, [[0.862, 0.608], [0.868, 0.608], [0.876, 0.852], [0.869, 0.853]]), paint(b, { l: 0.74, c: 0.05, h: 12 }));
  ctx.restore();
  ctx.lineWidth = U(0.0018);
  ctx.strokeStyle = paint(b, { l: 0.96, c: 0.02, h: 20 });
  ctx.stroke(sleeve);
};

// A desk clock in butter-yellow plastic. The time in its window is painted
// live, on a canvas of its own (client/clock.ts); here it is only the glass.
const clock: Study = (b) => {
  const { ctx, U } = b;
  const plastic: Tone = { l: 0.9, c: 0.085, h: 95 };
  const shell = box(b, 0.37, 0.77, 0.23, 0.115, 0.014);
  fillPath(b, shell, gradient(b, 0, 0.77, 0, 0.885, [[0, mix(plastic, 0.04)], [0.35, plastic], [1, mix(plastic, -0.08, -0.01)]]));
  ctx.save();
  ctx.clip(shell);
  ctx.fillStyle = gradient(b, 0.37, 0, 0.6, 0, [[0, { l: 1, c: 0, h: 0, a: 0.14 }], [0.45, { l: 1, c: 0, h: 0, a: 0 }], [0.85, { l: 0.3, c: 0.04, h: 80, a: 0.08 }], [1, { l: 0.3, c: 0.04, h: 80, a: 0.2 }]]);
  ctx.fill(shell);
  fillPath(b, box(b, 0.37, 0.77, 0.23, 0.009), paint(b, mix(plastic, 0.06, -0.02)));
  ctx.restore();
  fillPath(b, box(b, 0.515, 0.759, 0.06, 0.013, 0.004), gradient(b, 0, 0.759, 0, 0.772, [[0, { l: 0.82, c: 0.1, h: 38 }], [1, { l: 0.68, c: 0.11, h: 32 }]]));

  const [fx, fy, fw, fh] = CLOCK_FACE;
  const glass = box(b, fx, fy, fw, fh, 0.005);
  fillPath(b, glass, gradient(b, 0, fy, 0, fy + fh, [[0, { l: 0.2, c: 0.012, h: 40 }], [1, { l: 0.27, c: 0.015, h: 40 }]]));
  // The window's reflection, a pale slant across the glass.
  ctx.save();
  ctx.clip(glass);
  fillPath(b, shape(b, [[fx + fw * 0.06, fy], [fx + fw * 0.26, fy], [fx + fw * 0.14, fy + fh], [fx - fw * 0.06, fy + fh]]), paint(b, { l: 1, c: 0, h: 0, a: 0.07 }));
  ctx.restore();
  ctx.lineWidth = U(0.0024);
  ctx.strokeStyle = paint(b, mix(plastic, -0.16, 0.01));
  ctx.beginPath();
  ctx.moveTo(U(fx + 0.004), U(fy - 0.0008));
  ctx.lineTo(U(fx + fw - 0.004), U(fy - 0.0008));
  ctx.stroke();
  ctx.strokeStyle = paint(b, mix(plastic, 0.07, -0.02));
  ctx.beginPath();
  ctx.moveTo(U(fx + 0.004), U(fy + fh + 0.001));
  ctx.lineTo(U(fx + fw - 0.004), U(fy + fh + 0.001));
  ctx.stroke();
  for (const x of [0.395, 0.413, 0.431]) {
    fillPath(b, box(b, x, 0.866, 0.012, 0.0065, 0.002), gradient(b, 0, 0.866, 0, 0.8725, [[0, { l: 0.98, c: 0.03, h: 95 }], [1, { l: 0.8, c: 0.05, h: 90 }]]));
  }
  for (const x of [0.385, 0.555]) fillPath(b, box(b, x, 0.884, 0.03, 0.008, 0.002), paint(b, { l: 0.45, c: 0.02, h: 60 }));
};

// Two books lying flat: one with its spine to us, one showing its pages, and
// a ribbon left in to keep the place.
const books: Study = (b) => {
  const { ctx, U } = b;
  const blue: Tone = { l: 0.66, c: 0.07, h: 248 };
  fillPath(b, box(b, 0.1, 0.95, 0.26, 0.009), paint(b, mix(blue, 0.08, -0.015)));
  const spine = box(b, 0.1, 0.958, 0.26, 0.044, 0.006);
  fillPath(b, spine, gradient(b, 0, 0.958, 0, 1.002, [[0, mix(blue, -0.02)], [0.3, mix(blue, 0.07, -0.01)], [0.7, blue], [1, mix(blue, -0.12, 0.01)]]));
  for (const x of [0.118, 0.13, 0.33, 0.342]) {
    fillPath(b, box(b, x, 0.958, 0.0022, 0.044), paint(b, mix(blue, -0.14, 0.01)));
    fillPath(b, box(b, x + 0.0022, 0.958, 0.0016, 0.044), paint(b, mix(blue, 0.1)));
  }
  fillPath(b, box(b, 0.19, 0.967, 0.09, 0.026, 0.002), paint(b, mix(blue, -0.18, 0.01)));
  ctx.lineWidth = U(0.0013);
  ctx.strokeStyle = paint(b, { l: 0.84, c: 0.08, h: 86 });
  ctx.stroke(box(b, 0.193, 0.9695, 0.084, 0.021, 0.002));

  const sage: Tone = { l: 0.78, c: 0.06, h: 160 };
  fillPath(b, box(b, 0.12, 0.902, 0.226, 0.012, 0.002), gradient(b, 0.12, 0.902, 0.346, 0.914, [[0, mix(sage, 0.07, -0.01)], [1, mix(sage, 0.01)]]));
  fillPath(b, box(b, 0.122, 0.913, 0.222, 0.006), paint(b, mix(sage, -0.03)));
  fillPath(b, box(b, 0.127, 0.919, 0.212, 0.028), gradient(b, 0, 0.919, 0, 0.947, [[0, { l: 0.9, c: 0.02, h: 88 }], [0.3, { l: 0.97, c: 0.018, h: 92 }], [1, { l: 0.86, c: 0.022, h: 86 }]]));
  fillPath(b, box(b, 0.122, 0.946, 0.222, 0.006), paint(b, mix(sage, -0.1, 0.005)));
  // The ribbon comes out of the pages and over the blue book's spine.
  ctx.lineWidth = U(0.005);
  ctx.lineCap = 'butt';
  ctx.strokeStyle = paint(b, { l: 0.6, c: 0.15, h: 24 });
  ctx.beginPath();
  ctx.moveTo(U(0.262), U(0.94));
  ctx.quadraticCurveTo(U(0.266), U(0.975), U(0.262), U(1.012));
  ctx.stroke();
};

// A cup of black coffee. Its steam is not painted; it rises (client/steam.ts).
const cup: Study = (b) => {
  const { ctx, U } = b;
  const glaze: Tone = { l: 0.8, c: 0.075, h: 40 };
  // The handle first, so the body sits over its root.
  const handle = new Path2D();
  handle.ellipse(U(0.772), U(0.978), U(0.027), U(0.031), 0, 0, Math.PI * 2);
  handle.ellipse(U(0.772), U(0.978), U(0.015), U(0.02), 0, 0, Math.PI * 2, true);
  ctx.save();
  ctx.clip(box(b, 0.75, 0.93, 0.1, 0.1));
  fillPath(b, handle, gradient(b, 0.76, 0.947, 0.79, 1.01, [[0, mix(glaze, 0.07)], [0.5, mix(glaze, -0.02)], [1, mix(glaze, -0.12, 0.005)]]));
  ctx.restore();

  const body = new Path2D();
  body.ellipse(U(0.7125), U(0.936), U(0.051), U(0.0105), 0, 0, Math.PI);
  body.lineTo(U(0.666), U(1.028));
  body.ellipse(U(0.7125), U(1.028), U(0.0465), U(0.008), 0, Math.PI, 0, true);
  body.closePath();
  fillPath(b, body, gradient(b, 0.6615, 0, 0.7635, 0, turning(glaze)));
  // A glossy glaze shows the window as a soft upright light.
  ctx.save();
  ctx.clip(body);
  fillPath(b, box(b, 0.676, 0.946, 0.0065, 0.074, 0.003), paint(b, { l: 0.97, c: 0.02, h: 50, a: 0.55 }));
  ctx.restore();

  fillPath(b, oval(b, 0.7125, 0.936, 0.051, 0.0105), paint(b, mix(glaze, 0.1, -0.02)));
  fillPath(b, oval(b, 0.7125, 0.9365, 0.0465, 0.0084), gradient(b, 0.666, 0, 0.759, 0, [[0, mix(glaze, -0.14)], [1, mix(glaze, 0.02)]]));
  // Coffee, a ring of crema where it meets the cup, the window on it.
  fillPath(b, oval(b, 0.7125, 0.938, 0.043, 0.0066), paint(b, { l: 0.6, c: 0.075, h: 62 }));
  fillPath(b, oval(b, 0.7125, 0.9383, 0.039, 0.0055), gradient(b, 0.674, 0, 0.751, 0, [[0, { l: 0.24, c: 0.035, h: 45 }], [1, { l: 0.33, c: 0.045, h: 52 }]]));
  fillPath(b, oval(b, 0.701, 0.9375, 0.01, 0.0016), paint(b, { l: 0.78, c: 0.03, h: 75, a: 0.7 }));
};

// A pendant lamp in green enamel, white inside, on a cloth cord out of the
// top of the canvas. We look up at it, so the opening shows as an ellipse,
// the near rim at its top, with the bulb hanging in it.
const LAMP_X = LAMP_PIVOT[0];
/** The shade's opening: centre and radii. */
const MOUTH = [LAMP_X, 0.145, 0.07, 0.016] as const;

function shadePath(b: Brush) {
  const { U } = b;
  const [x, y, rx, ry] = MOUTH;
  const path = new Path2D();
  path.moveTo(U(x - 0.019), U(0.084));
  path.bezierCurveTo(U(x - 0.024), U(0.11), U(x - 0.056), U(0.12), U(x - rx), U(y));
  path.ellipse(U(x), U(y), U(rx), U(ry), 0, Math.PI, Math.PI * 2);
  path.bezierCurveTo(U(x + 0.056), U(0.12), U(x + 0.024), U(0.11), U(x + 0.019), U(0.084));
  path.quadraticCurveTo(U(x), U(0.078), U(x - 0.019), U(0.084));
  return path;
}

const lamp: Study = (b) => {
  const { ctx, U } = b;
  const [x, y, rx, ry] = MOUTH;
  const enamel: Tone = { l: 0.5, c: 0.075, h: 165 };
  const brass: Tone = { l: 0.74, c: 0.09, h: 82 };
  fillPath(b, box(b, x - 0.0095, 0.064, 0.019, 0.024, 0.003), gradient(b, x - 0.0095, 0, x + 0.0095, 0, turning(brass)));
  fillPath(b, box(b, x - 0.012, 0.082, 0.024, 0.005, 0.002), gradient(b, x - 0.012, 0, x + 0.012, 0, turning(mix(brass, -0.06))));

  const shade = shadePath(b);
  fillPath(b, shade, gradient(b, x - rx, 0, x + rx, 0, turning(enamel)));
  ctx.save();
  ctx.clip(shade);
  // The enamel is glossy: the window lies on the near shoulder as a streak.
  ctx.lineCap = 'round';
  ctx.lineWidth = U(0.006);
  ctx.strokeStyle = paint(b, { l: 0.96, c: 0.02, h: 160, a: 0.5 });
  ctx.beginPath();
  ctx.moveTo(U(x - 0.016), U(0.091));
  ctx.quadraticCurveTo(U(x - 0.03), U(0.118), U(x - 0.052), U(0.131));
  ctx.stroke();
  // The crown, turned away from the light.
  ctx.fillStyle = gradient(b, 0, 0.078, 0, 0.1, [[0, { ...mix(enamel, -0.12), a: 0.7 }], [1, { ...mix(enamel, -0.12), a: 0 }]]);
  ctx.fill(shade);
  ctx.restore();

  // Inside, white enamel: darker deep in, toward the socket.
  fillPath(b, oval(b, x, y, rx, ry), gradient(b, 0, y - ry, 0, y + ry, [[0, { l: 0.74, c: 0.03, h: 88 }], [0.6, { l: 0.92, c: 0.025, h: 92 }], [1, { l: 0.86, c: 0.03, h: 88 }]]));
  // The rolled rim along the near side.
  ctx.lineWidth = U(0.003);
  ctx.strokeStyle = paint(b, { l: 0.95, c: 0.02, h: 100 });
  ctx.beginPath();
  ctx.ellipse(U(x), U(y), U(rx - 0.0012), U(ry - 0.0008), 0, Math.PI, Math.PI * 2);
  ctx.stroke();
  // The bulb, frosted glass, hanging a little below the rim.
  const glass = ctx.createRadialGradient(U(x - 0.006), U(0.151), 0, U(x), U(LAMP_BULB[1]), U(0.02));
  glass.addColorStop(0, paint(b, { l: 0.98, c: 0.012, h: 90 }));
  glass.addColorStop(1, paint(b, { l: 0.8, c: 0.02, h: 85 }));
  fillPath(b, oval(b, x, LAMP_BULB[1], 0.0175, 0.0185), glass);
};

const STUDIES: Record<PieceId, Study> = { works, badge, plant, disc, record, clock, books, cup, lamp };

// --- Finishing marks, laid with the knife's edge after the painting ------------------

const FINISH: Partial<Record<PieceId, Study>> = {
  badge: (b) => {
    for (let x = 0.312; x < 0.388; x += 0.0042 + b.rand() * 0.004) {
      line(b, x, 0.418, x, 0.44, 0.0014 + b.rand() * 0.0018, { l: 0.36, c: 0.01, h: 250 }, 0.3);
    }
  },
  // Over the disc, on the sleeve's canvas so it stays put while the disc
  // turns: the window in the grooves, two wedges of light with short bright
  // ticks through them, and the shade where the disc goes into the sleeve.
  record: (b) => {
    const { ctx, U, night } = b;
    const [cx, cy, r] = RECORD_DISC;
    const face = oval(b, cx, cy, r, r);
    ctx.save();
    ctx.clip(face);
    if (ctx.createConicGradient) {
      const sheen = ctx.createConicGradient(-2.69, U(cx), U(cy));
      const clear = paint(b, { l: 0.55, c: 0.012, h: 255, a: 0 });
      for (const [at, a] of [[0, 0], [0.07, night ? 0.16 : 0.28], [0.15, 0], [0.5, 0], [0.57, night ? 0.12 : 0.2], [0.65, 0], [1, 0]] as const) {
        sheen.addColorStop(at, a ? paint(b, { l: 0.55, c: 0.012, h: 255, a }) : clear);
      }
      fillPath(b, face, sheen);
    }
    ctx.fillStyle = gradient(b, 0, 0.59, 0, 0.62, [[0, { l: 0.1, c: 0, h: 0, a: 0 }], [1, { l: 0.1, c: 0, h: 0, a: 0.6 }]]);
    ctx.fillRect(U(cx - r), U(0.59), U(r * 2), U(0.03));
    ctx.restore();
    const tick: Tone = { l: 0.6, c: 0.01, h: 250, a: night ? 0.2 : 0.36 };
    for (let ring = 0.044; ring < 0.101; ring += 0.0028 + b.rand() * 0.0016) {
      for (const middle of [-2.25, 0.89]) {
        // Widest at the rim, where the grooves run longest under the light.
        const sweep = (0.1 + b.rand() * 0.12) * (ring / 0.1);
        const at = middle - sweep / 2 + (b.rand() - 0.5) * 0.16;
        const [x1, y1] = [cx + Math.cos(at) * ring, cy + Math.sin(at) * ring];
        const [x2, y2] = [cx + Math.cos(at + sweep) * ring, cy + Math.sin(at + sweep) * ring];
        // The lower wedge sits inside the sleeve.
        if (Math.max(y1, y2) < 0.6) line(b, x1, y1, x2, y2, 0.0012, tick, 0.2);
      }
    }
  },
  books: (b) => {
    for (const y of [0.925, 0.931, 0.937, 0.942]) line(b, 0.13, y, 0.336, y, 0.0009, { l: 0.8, c: 0.02, h: 85, a: 0.6 }, 0.3);
  },
  // The cord, and the pull chain hanging out of the shade beside the bulb:
  // finer than any blade.
  lamp: (b) => {
    const { ctx, U } = b;
    const cord: Tone = { l: 0.3, c: 0.02, h: 60 };
    ctx.lineCap = 'butt';
    ctx.lineWidth = U(0.0034);
    ctx.strokeStyle = paint(b, cord);
    ctx.beginPath();
    ctx.moveTo(U(LAMP_X), U(-0.06));
    ctx.lineTo(U(LAMP_X), U(0.066));
    ctx.stroke();
    line(b, LAMP_X - 0.0006, -0.06, LAMP_X - 0.0006, 0.066, 0.0012, mix(cord, 0.16), 0.2);
    const brass: Tone = { l: 0.78, c: 0.09, h: 82 };
    for (let y = 0.152; y < 0.2; y += 0.0042) {
      const x = LAMP_X + 0.03 + (y - 0.152) * 0.04;
      fillPath(b, oval(b, x, y, 0.0015, 0.0015), paint(b, mix(brass, (y * 1000) % 2 > 1 ? 0.04 : -0.04)));
    }
    const knob = ctx.createRadialGradient(U(LAMP_X + 0.0315), U(0.205), 0, U(LAMP_X + 0.032), U(0.207), U(0.006));
    knob.addColorStop(0, paint(b, mix(brass, 0.12, -0.02)));
    knob.addColorStop(1, paint(b, mix(brass, -0.18)));
    fillPath(b, oval(b, LAMP_X + 0.032, 0.207, 0.0036, 0.0058), knob);
  },
};

// --- Knives ---------------------------------------------------------------------------

/** Blade widths per layer, in canvas widths, widest first; never below two pixels. */
function knives(u: number, sizes: number[], thresholds: number[]) {
  return sizes.map((size, i) => ({ size: Math.max(2, size * u), threshold: thresholds[i] }));
}

function styleOf(id: PieceId, u: number): Style {
  const common: Style = {
    layers: knives(u, [0.019, 0.0105, 0.0058], [0, 26, 20]),
    stretch: [1.5, 3.2],
    angle: -0.1,
    jitter: 0.4,
    spill: 0.004 * u,
    accents: PALETTE,
    accentShare: 0.05,
    whiteShare: 0.35,
  };
  switch (id) {
    case 'works':
    case 'badge':
    case 'lamp':
      return { ...common, layers: knives(u, [0.013, 0.0072, 0.0039], [0, 22, 18]), spill: 0.002 * u };
    case 'plant':
      return { ...common, layers: knives(u, [0.016, 0.009, 0.005], [0, 24, 18]), spill: 0.005 * u, accentShare: 0.06, whiteShare: 0.3 };
    case 'clock':
      return { ...common, layers: knives(u, [0.017, 0.009, 0.005], [0, 22, 16]), spill: 0.003 * u };
    case 'books':
      return { ...common, angle: 0, jitter: 0.12, spill: 0.003 * u };
    default:
      return common;
  }
}

// --- Painting --------------------------------------------------------------------------

/** The wall, the table and every shadow, onto a canvas `u` wide whose context is scaled to CSS pixels. */
export async function paintBackdrop(ctx: CanvasRenderingContext2D, u: number, night: boolean, signal?: AbortSignal) {
  const study = document.createElement('canvas');
  study.width = Math.round(u);
  study.height = Math.round(u * ASPECT);
  const studyCtx = study.getContext('2d', { willReadFrequently: true });
  if (!studyCtx) return;
  backdropStudy(brush(studyCtx, u, night, 7));
  // The study is the underpainting; long flat drags go over it, and smaller
  // ones only where the shadows' edges need them.
  ctx.drawImage(study, 0, 0, u, u * ASPECT);
  await paintOver(
    ctx,
    study,
    [0, 0],
    {
      layers: knives(u, [0.042, 0.022, 0.011], [0, 5, 11]),
      stretch: [1.8, 4.6],
      angle: 0,
      jitter: 0.3,
      grain: 0.75,
      accents: [mix(wall(night), 0, 0.01, 30), mix(wall(night), 0, 0, -26), mix(table(night), 0, 0.01, -20)],
      accentShare: 0.06,
      whiteShare: 0.22,
    },
    seeded(11),
    signal,
  );
}

/**
 * One thing, onto its own canvas: the thing's box plus BLEED on every side,
 * with `ctx` set to draw in the painting's CSS pixels.
 */
export async function paintPiece(ctx: CanvasRenderingContext2D, piece: Piece, u: number, night: boolean, signal?: AbortSignal) {
  const [x, y, w, h] = piece.box;
  const left = (x - BLEED) * u;
  const top = (y - BLEED) * u;
  const study = document.createElement('canvas');
  study.width = Math.round((w + BLEED * 2) * u);
  study.height = Math.round((h + BLEED * 2) * u);
  const studyCtx = study.getContext('2d', { willReadFrequently: true });
  if (!studyCtx) return;
  studyCtx.translate(-left, -top);
  const seed = seedOf(piece.id);
  STUDIES[piece.id](brush(studyCtx, u, night, seed));
  await paintOver(ctx, study, [left, top], styleOf(piece.id, u), seeded(seed ^ 0x9e3779b9), signal);
  if (!signal?.aborted) FINISH[piece.id]?.(brush(ctx, u, night, seed + 1));
}


// --- The lamp's light -------------------------------------------------------------------

/** Lamplight at intensity `i` (0..1), as the colour of a light layer's pixel. */
const lamplight = (i: number) => {
  const v = Math.max(0, Math.min(1, i)) * 255;
  return `rgb(${Math.round(v)} ${Math.round(v * 0.8)} ${Math.round(v * 0.52)})`;
};

/** An elliptical glow with its intensity at each stop. */
function glow(b: Brush, cx: number, cy: number, rx: number, ry: number, stops: [number, number][]) {
  const { ctx, U } = b;
  ctx.save();
  ctx.translate(U(cx), U(cy));
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, U(rx));
  for (const [at, i] of stops) g.addColorStop(at, lamplight(i));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, U(rx), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// The cone runs from the shade's opening down to a pool on the table; its
// sides, carried up, meet at APEX.
const POOL = [LAMP_X, 0.935, 0.32, 0.105] as const;
const APEX: [number, number] = [LAMP_X, -0.05];

/** The cone as it shows through the air: down from the rim, round the near edge of the pool. */
function conePath(b: Brush) {
  const { U } = b;
  const [mx, my, mrx] = MOUTH;
  const [px, py, prx, pry] = POOL;
  const path = new Path2D();
  path.moveTo(U(mx - mrx * 0.92), U(my + 0.004));
  path.lineTo(U(px - prx), U(py));
  path.ellipse(U(px), U(py), U(prx), U(pry), 0, Math.PI, 0, true);
  path.lineTo(U(mx + mrx * 0.92), U(my + 0.004));
  path.closePath();
  return path;
}

/**
 * The lamp's light, onto two canvases the size of the painting (`ctx`s scaled
 * to its CSS pixels). `lit` is what the light falls on, and is laid over the
 * painting with colour-dodge, which brightens the paint the way light does:
 * dark stays dark, and colour comes up warm. `air` is the cone the light draws
 * through the room, laid on with screen; its knife strokes run down the rays.
 * By day the window outshines it, and it is weaker.
 */
export function paintLight(lit: CanvasRenderingContext2D, air: CanvasRenderingContext2D, u: number, night: boolean) {
  const k = night ? 1 : 0.22;
  // Light is not a paint the night darkens.
  const bright = (ctx: CanvasRenderingContext2D, seed: number): Brush => ({ ...brush(ctx, u, night, seed), t: (tone) => tone });
  const b = bright(lit, 29);
  const [mx, my, mrx, mry] = MOUTH;
  const [px, py, prx, pry] = POOL;
  lit.globalCompositeOperation = 'lighter';
  // The pool on the table, its edge the shade's rim, a little soft.
  glow(b, px, py, prx, pry, [[0, 0.5 * k], [0.55, 0.42 * k], [0.82, 0.18 * k], [1, 0]]);
  // A lower wash down the cone, for whatever on the wall stands in it.
  const wash = lit.createLinearGradient(0, b.U(my), 0, b.U(py));
  wash.addColorStop(0, lamplight(0.22 * k));
  wash.addColorStop(0.7, lamplight(0.1 * k));
  wash.addColorStop(1, lamplight(0));
  lit.fillStyle = wash;
  lit.fill(conePath(b));
  // The wall round the lamp, from the light off the shade.
  glow(b, mx, my + 0.01, 0.22, 0.17, [[0, 0.16 * k], [1, 0]]);
  // Inside the shade, and the bulb: bright by day as well.
  glow(b, mx, my, mrx, mry, [[0, 0.8], [0.7, 0.62], [1, 0.3]]);
  glow(b, mx, LAMP_BULB[1], 0.034, 0.034, [[0, 0.95], [0.5, 0.6], [1, 0]]);
  // What stands in the pool throws a shadow of the lamp's own, away from it.
  lit.globalCompositeOperation = 'destination-out';
  soft(b, oval(b, 0.488, 0.9, 0.1, 0.011), { l: 0, c: 0, h: 0, a: 0.55 }, 0.012);
  soft(b, oval(b, 0.79, 1.034, 0.045, 0.011, 0.25), { l: 0, c: 0, h: 0, a: 0.5 }, 0.012);
  soft(b, oval(b, 0.2, 1.012, 0.09, 0.009), { l: 0, c: 0, h: 0, a: 0.35 }, 0.012);
  lit.globalCompositeOperation = 'source-over';

  // The air: painted at one pixel per CSS pixel, which is as fine as a haze needs.
  const width = Math.round(u);
  const height = Math.round(u * ASPECT);
  const haze = document.createElement('canvas');
  haze.width = width;
  haze.height = height;
  const hazeCtx = haze.getContext('2d');
  if (!hazeCtx) return;
  const h = bright(hazeCtx, 31);
  // Warm enough to stay amber where it screens over the blue night wall.
  const beam: Tone = { l: 0.9, c: 0.11, h: 72 };
  soft(h, conePath(h), { ...beam, a: 0.42 }, 0.02);
  // A brighter core, under the bulb.
  const core = new Path2D();
  core.addPath(conePath(h), new DOMMatrix().translate(h.U(LAMP_X), h.U(my)).scale(0.55, 1).translate(-h.U(LAMP_X), -h.U(my)));
  soft(h, core, { ...beam, a: 0.28 }, 0.03);
  // Knife strokes down the rays: the light laid on with the blade's edge.
  const spread = Math.atan((prx - mrx) / (py - my));
  for (let i = 0; i < 90; i++) {
    const ray = (h.rand() - 0.5) * 2 * spread * 0.95;
    const along = 0.24 + h.rand() * 0.86;
    const [x, y] = [APEX[0] + Math.sin(ray) * along, APEX[1] + Math.cos(ray) * along];
    const width = h.U(0.008 + h.rand() * 0.02);
    const tone = { ...vary(h.rand, beam), a: 0.06 + h.rand() * 0.12 };
    draw(hazeCtx, strokeAt(h.rand, h.U(x), h.U(y), Math.PI / 2 - ray, width * (4 + h.rand() * 5), width, tone, 0.35));
  }
  // Only inside the cone, and thinning as the light spreads. The soft edge
  // goes on a mask first: a shadow drawn with destination-in would clear the
  // canvas for the shape held off it.
  const mask = document.createElement('canvas');
  mask.width = width;
  mask.height = height;
  const maskCtx = mask.getContext('2d');
  if (!maskCtx) return;
  soft(bright(maskCtx, 0), conePath(h), { l: 1, c: 0, h: 0 }, 0.016);
  hazeCtx.globalCompositeOperation = 'destination-in';
  hazeCtx.drawImage(mask, 0, 0);
  const thin = hazeCtx.createLinearGradient(0, h.U(my), 0, h.U(py + pry));
  for (const [at, a] of [[0, 0.2], [0.04, 1], [0.35, 0.62], [0.7, 0.32], [0.88, 0.16], [1, 0]] as const) thin.addColorStop(at, `rgb(0 0 0 / ${a})`);
  hazeCtx.fillStyle = thin;
  hazeCtx.fillRect(0, 0, width, height);

  air.save();
  air.globalAlpha = night ? 0.7 : 0.3;
  air.drawImage(haze, 0, 0, u, u * ASPECT);
  air.restore();
  // The bulb's bloom.
  const bloom = air.createRadialGradient(b.U(mx), b.U(LAMP_BULB[1]), 0, b.U(mx), b.U(LAMP_BULB[1]), b.U(0.075));
  bloom.addColorStop(0, `rgb(255 236 200 / ${night ? 0.75 : 0.45})`);
  bloom.addColorStop(0.35, `rgb(255 220 160 / ${night ? 0.3 : 0.16})`);
  bloom.addColorStop(1, 'rgb(255 210 150 / 0)');
  air.fillStyle = bloom;
  air.fillRect(0, 0, b.U(1), b.U(ASPECT));
}
