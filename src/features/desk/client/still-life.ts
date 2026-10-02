// Paints "Still life with a desk", one thing at a time. The wall, the table
// and the shadows go on the backdrop; each thing gets its own canvas, so it
// can lift off the table when its word in the prose is pointed at. Positions
// come from shared/still-life.ts in canvas widths; `u` turns them into pixels.
//
// The palette is chalky and light: every colour is mixed with white, and only
// the record and the clock's digits are allowed to be dark or loud. Shapes
// are blocked in flat and finished with a few wide knife slabs, light side up
// and left. At night the room goes dark and only the clock keeps its light.

import { ASPECT, CLOCK_FACE, HORIZON, WALL_WORK, type ThingId } from '@/features/desk/shared/still-life';
import { draw, ellipse, fill, polygon, rect, ring, seedOf, seeded, stroke, vary, type Fill, type Rand, type Region, type Tone } from './knife';
import { paintStudy } from './studies';

type Shade = (l: number, c: number, h: number, a?: number) => Tone;

interface Brush {
  ctx: CanvasRenderingContext2D;
  rand: Rand;
  /** Canvas widths to pixels. */
  U: (v: number) => number;
  /** A colour as the room's light shows it. */
  t: Shade;
  night: boolean;
}

const brush = (ctx: CanvasRenderingContext2D, u: number, night: boolean, seed: number): Brush => ({
  ctx,
  rand: seeded(seed),
  U: (v) => v * u,
  t: (l, c, h, a) => (night ? { l: 0.1 + l * 0.52, c: c * 0.8, h, a } : { l, c, h, a }),
  night,
});

const WALL = { l: 0.885, c: 0.028, h: 232 };
const TABLE = { l: 0.925, c: 0.022, h: 80 };

/** The wall and the table, as the room's light shows them. */
export const ground = (night: boolean) => ({
  wall: night ? { l: 0.3, c: 0.03, h: 250 } : WALL,
  table: night ? { l: 0.345, c: 0.02, h: 65 } : TABLE,
});

/** A straight drag of paint from one point to another. */
function line(b: Brush, x1: number, y1: number, x2: number, y2: number, width: number, tone: Tone) {
  const { U, rand, ctx } = b;
  const dx = U(x2 - x1);
  const dy = U(y2 - y1);
  draw(ctx, stroke(rand, U(x1), U(y1), Math.atan2(dy, dx), Math.hypot(dx, dy), U(width), tone, 0.5));
}

/**
 * A shape blocked in flat and finished with a few wide slabs. `tone` is the
 * paint at a point; a plain tone is mixed a little differently per slab.
 */
function slab(b: Brush, region: Region, tone: Tone | ((x: number, y: number) => Tone), options: Partial<Fill> = {}) {
  const { ctx, rand, U } = b;
  const at = typeof tone === 'function' ? tone : () => vary(rand, tone, 0.018, 0.006, 3);
  fill(ctx, rand, region, { size: U(0.026), stretch: [1.6, 2.8], jitter: 0.08, density: 1.1, hold: 0.97, grain: 0.55, ...options, tone: at });
}

/** Lighter toward the left edge of a box, the side the window is on. */
const lit = (b: Brush, tone: Tone, left: number, width: number, fall = 0.06) => (x: number) =>
  vary(b.rand, { ...tone, l: tone.l + fall / 2 - ((x - b.U(left)) / b.U(width)) * fall }, 0.014, 0.005, 3);

// --- Backdrop --------------------------------------------------------------

export function paintBackdrop(ctx: CanvasRenderingContext2D, u: number, night: boolean) {
  const { U, rand } = brush(ctx, u, night, 7);
  const { wall, table } = ground(night);
  const width = U(1);
  const horizon = U(HORIZON);
  const height = U(ASPECT);

  ctx.fillStyle = `oklch(${wall.l} ${wall.c} ${wall.h})`;
  ctx.fillRect(0, 0, width, horizon);
  ctx.fillStyle = `oklch(${table.l} ${table.c} ${table.h})`;
  ctx.fillRect(0, horizon, width, height - horizon);

  // Long, flat passes: the colour fields are painted too, just quietly.
  const flat = { stretch: [3, 6] as [number, number], jitter: 0.04, density: 1, hold: 1, grain: 0.3, under: false };
  fill(ctx, rand, rect(0, 0, width, horizon), { ...flat, size: U(0.07), tone: () => vary(rand, wall, 0.011, 0.005, 2) });
  fill(ctx, rand, rect(0, horizon, width, height - horizon), { ...flat, size: U(0.06), tone: () => vary(rand, table, 0.01, 0.005, 3) });
  // The back of the table falls into the wall's shade.
  fill(ctx, rand, rect(0, horizon, width, U(0.03)), {
    ...flat,
    size: U(0.022),
    density: 0.9,
    tone: () => vary(rand, { ...table, l: table.l - 0.03 }, 0.008, 0.004, 3),
  });

  // Light comes from the upper left; every shadow falls right.
  const wallShade = () => vary(rand, { ...wall, l: wall.l - (night ? 0.045 : 0.06), c: wall.c + 0.006 }, 0.008, 0.004, 2);
  const tableShade = () => vary(rand, { ...table, l: table.l - (night ? 0.06 : 0.075), c: table.c + 0.01, a: 0.9 }, 0.01, 0.004, 4);
  const soft = { stretch: [2, 3.6] as [number, number], jitter: 0.06, density: 1.3, hold: 0.9, grain: 0.3, under: false };
  const [wx, wy, ww, wh] = WALL_WORK.box;
  fill(ctx, rand, rect(U(wx + 0.008), U(wy + 0.01), U(ww), U(wh)), { ...soft, size: U(0.012), tone: wallShade });
  fill(ctx, rand, rect(U(0.307), U(0.31), U(0.1), U(0.155)), { ...soft, size: U(0.012), tone: wallShade });
  const pools: [number, number, number, number][] = [
    [0.2, 0.896, 0.075, 0.011],
    [0.5, 0.888, 0.13, 0.011],
    [0.79, 0.866, 0.12, 0.011],
    [0.25, 1.002, 0.16, 0.014],
    [0.735, 1.033, 0.075, 0.012],
  ];
  for (const [x, y, rx, ry] of pools) {
    fill(ctx, rand, ellipse(U(x), U(y), U(rx), U(ry)), { ...soft, size: U(0.014), stretch: [2.4, 4.2], jitter: 0.04, tone: tableShade });
  }

  // At night the clock is the lamp: a warm pool of its light on the table.
  if (night) {
    fill(ctx, rand, ellipse(U(0.485), U(0.893), U(0.12), U(0.016)), {
      size: U(0.012),
      stretch: [3, 5],
      jitter: 0.03,
      density: 0.9,
      hold: 0.6,
      grain: 0.3,
      under: false,
      tone: () => vary(rand, { l: 0.52, c: 0.06, h: 55, a: 0.16 }, 0.02, 0.008, 4),
    });
  }
}

// --- Things ------------------------------------------------------------------

type Painter = (b: Brush) => void;

// One small work on the wall, framed in pale oak and matted: the first of the
// projects' studies.
const works: Painter = (b) => {
  const { ctx, U, t, night } = b;
  const [x, y, w, h] = WALL_WORK.box.map(U);
  const frame = U(0.007);
  const mat = U(0.016);
  slab(b, rect(x, y, w, h), t(0.74, 0.045, 70), { size: U(0.01), stretch: [3, 6], jitter: 0.03, density: 1.2, hold: 1 });
  slab(b, rect(x + frame, y + frame, w - frame * 2, h - frame * 2), t(0.975, 0.008, 90), { size: U(0.016), stretch: [2, 4], hold: 1, grain: 0.35 });
  const inset = frame + mat;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + inset, y + inset, w - inset * 2, h - inset * 2);
  ctx.clip();
  ctx.translate(x + inset, y + inset);
  paintStudy(ctx, WALL_WORK.study, w - inset * 2, h - inset * 2, night, seedOf(WALL_WORK.study));
  // The study is painted for a lit panel; on the wall at night it is in the dark.
  if (night) {
    ctx.fillStyle = 'oklch(0.2 0.03 250 / 0.35)';
    ctx.fillRect(0, 0, w - inset * 2, h - inset * 2);
  }
  ctx.restore();
};

// A card on a lanyard, hung from a nail.
const badge: Painter = (b) => {
  const { ctx, rand, U, t } = b;
  const strap = t(0.58, 0.07, 265);
  line(b, 0.35, 0.172, 0.31, 0.305, 0.011, strap);
  line(b, 0.35, 0.172, 0.39, 0.305, 0.011, vary(rand, strap, 0.03, 0.008, 4));
  ctx.fillStyle = `oklch(${b.night ? 0.22 : 0.4} 0.01 60)`;
  ctx.beginPath();
  ctx.arc(U(0.35), U(0.17), U(0.006), 0, Math.PI * 2);
  ctx.fill();

  slab(b, rect(U(0.3), U(0.3), U(0.1), U(0.155)), lit(b, t(0.97, 0.006, 95), 0.3, 0.1, 0.04), { size: U(0.02) });
  slab(b, rect(U(0.3), U(0.3), U(0.1), U(0.028)), t(0.56, 0.07, 262), { size: U(0.012), stretch: [2, 4], hold: 1 });
  // The photo: hair over a face.
  slab(b, rect(U(0.312), U(0.344), U(0.032), U(0.044)), (_, y) => vary(rand, y < U(0.358) ? t(0.42, 0.03, 40) : t(0.82, 0.05, 55), 0.02, 0.008, 4), {
    size: U(0.01),
    stretch: [1.2, 2],
    hold: 1,
  });
  for (const [y, w] of [[0.35, 0.034], [0.364, 0.026], [0.378, 0.03]] as const) {
    line(b, 0.352, y, 0.352 + w, y, 0.0045, t(0.74, 0.01, 250));
  }
  for (let x = 0.312; x < 0.388; x += 0.0045 + rand() * 0.0045) {
    line(b, x, 0.42, x, 0.44, 0.0016 + rand() * 0.002, t(0.42, 0.01, 250));
  }
};

// A pilea in a terracotta pot, for everything that grows on GitHub: round
// leaves on thin stems, the ones at the back in shade.
const plant: Painter = (b) => {
  const { U, t } = b;
  const cx = 0.18;
  const base = 0.795;
  // x, y, radius, light (0 back, 1 front).
  const leaves: [number, number, number, number][] = [
    [0.12, 0.6, 0.03, 0],
    [0.235, 0.585, 0.031, 0],
    [0.175, 0.55, 0.034, 0.3],
    [0.105, 0.69, 0.027, 0.4],
    [0.258, 0.675, 0.028, 0.4],
    [0.205, 0.645, 0.031, 0.8],
    [0.145, 0.715, 0.025, 1],
    [0.218, 0.73, 0.022, 1],
  ];
  for (const [x, y, r, light] of leaves) {
    const tone = t(0.66 + light * 0.14, 0.09 - light * 0.015, 140 - light * 8);
    line(b, cx + (x - cx) * 0.12, base, x, y + r * 0.6, 0.0035, t(0.62, 0.07, 130));
    const tilt = Math.atan2(y - base, x - cx) + Math.PI / 2;
    slab(b, ellipse(U(x), U(y), U(r), U(r * 0.86), tilt), lit(b, tone, x - r, r * 2, 0.08), { size: U(r * 0.5), angle: tilt, jitter: 0.12 });
  }
  slab(b, polygon([[U(0.122), U(0.802)], [U(0.238), U(0.802)], [U(0.226), U(0.895)], [U(0.134), U(0.895)]]), lit(b, t(0.76, 0.075, 45), 0.122, 0.116, 0.1), {
    size: U(0.02),
  });
  slab(b, rect(U(0.114), U(0.79), U(0.132), U(0.02)), lit(b, t(0.81, 0.07, 48), 0.114, 0.132, 0.08), { size: U(0.01), stretch: [3, 5], hold: 1 });
};

// A record leaning on the wall, half out of its sleeve.
const record: Painter = (b) => {
  const { ctx, rand, U, t } = b;
  const cx = U(0.75);
  const cy = U(0.6);
  const around = (x: number, y: number) => Math.atan2(y - cy, x - cx) + Math.PI / 2;
  slab(b, ellipse(cx, cy, U(0.105), U(0.105)), t(0.27, 0.012, 280), { size: U(0.018), angleAt: around, jitter: 0.06, density: 1.6 });
  fill(ctx, rand, ring(cx, cy, U(0.09), U(0.045)), {
    size: U(0.007),
    stretch: [3, 5],
    jitter: 0.04,
    density: 0.5,
    hold: 1,
    grain: 0.4,
    under: false,
    angleAt: around,
    tone: () => vary(rand, { ...t(0.4, 0.01, 275), a: 0.6 }, 0.03, 0.004, 8),
  });
  slab(b, ellipse(cx, cy, U(0.032), U(0.032)), t(0.88, 0.09, 85), { size: U(0.012), jitter: 0.5, stretch: [1.4, 2.2] });

  const lean = -0.04;
  const corner = (dx: number, dy: number): [number, number] => {
    const x = U(0.745) + U(dx) * Math.cos(lean) - U(dy) * Math.sin(lean);
    const y = U(0.735) + U(dx) * Math.sin(lean) + U(dy) * Math.cos(lean);
    return [x, y];
  };
  const half = 0.122;
  slab(b, polygon([corner(-half, -half), corner(half, -half), corner(half, half), corner(-half, half)]), lit(b, t(0.89, 0.045, 10), 0.62, 0.25, 0.06), {
    angle: lean,
    size: U(0.028),
  });
  // The cover: one sun, and a line under it.
  slab(b, ellipse(U(0.73), U(0.745), U(0.048), U(0.048)), t(0.82, 0.1, 68), { size: U(0.016), jitter: 0.12, stretch: [1.4, 2.4] });
  line(b, 0.665, 0.822, 0.83, 0.815, 0.007, t(0.72, 0.07, 20));
};

// A desk clock in butter-yellow plastic. The time in its window is painted
// live, on a canvas of its own (client/clock.ts); here it is only the glass.
const clock: Painter = (b) => {
  const { ctx, rand, U, t } = b;
  slab(b, rect(U(0.37), U(0.77), U(0.23), U(0.115)), lit(b, t(0.9, 0.085, 95), 0.37, 0.23, 0.06), { size: U(0.02), stretch: [2.4, 4] });
  // Light on the top edge, shade down the right side.
  slab(b, rect(U(0.37), U(0.77), U(0.23), U(0.01)), t(0.95, 0.06, 97), { size: U(0.007), stretch: [3, 6], hold: 1 });
  slab(b, rect(U(0.587), U(0.78), U(0.013), U(0.105)), t(0.82, 0.08, 88), { size: U(0.007), angle: Math.PI / 2, hold: 1 });
  // The snooze bar.
  slab(b, rect(U(0.52), U(0.759), U(0.055), U(0.011)), t(0.76, 0.1, 35), { size: U(0.006), stretch: [3, 5], hold: 1 });
  const [fx, fy, fw, fh] = CLOCK_FACE.map(U);
  slab(b, rect(fx, fy, fw, fh), t(0.27, 0.014, 40), { size: U(0.012), stretch: [2.4, 4.4], hold: 1, grain: 0.45 });
  // Three buttons under the window, and the feet.
  for (const x of [0.395, 0.413, 0.431]) {
    draw(ctx, stroke(rand, U(x), U(0.871), 0, U(0.011), U(0.006), t(0.97, 0.03, 90), 0.4));
  }
  for (const x of [0.385, 0.555]) {
    slab(b, rect(U(x), U(0.885), U(0.03), U(0.008)), t(0.5, 0.02, 60), { size: U(0.005), hold: 1 });
  }
};

// Two books, flat, spines out.
const books: Painter = (b) => {
  const { U, t } = b;
  const stack: [number, number, number, number, Tone][] = [
    [0.1, 0.955, 0.26, 0.046, t(0.72, 0.06, 245)],
    [0.12, 0.91, 0.22, 0.045, t(0.85, 0.045, 172)],
  ];
  for (const [x, y, w, h, tone] of stack) {
    slab(b, rect(U(x), U(y), U(w), U(h)), lit(b, tone, x, w, 0.07), { size: U(0.018), stretch: [2.4, 4.4], jitter: 0.04, hold: 1 });
    // The page block shows at one end of each.
    slab(b, rect(U(x + w - 0.026), U(y + 0.006), U(0.02), U(h - 0.012)), t(0.97, 0.015, 88), { size: U(0.005), stretch: [2, 3.4], hold: 1 });
    line(b, x + 0.03, y + h * 0.5, x + 0.09 + w * 0.12, y + h * 0.5, h * 0.16, { ...tone, l: tone.l - 0.16, c: tone.c * 0.7 });
  }
};

// A cup of tea, still warm.
const cup: Painter = (b) => {
  const { ctx, rand, U, t } = b;
  const hx = U(0.772);
  const hy = U(0.975);
  fill(ctx, rand, ring(hx, hy, U(0.03), U(0.017)), {
    size: U(0.01),
    stretch: [1.4, 2.4],
    jitter: 0.1,
    density: 1.6,
    hold: 0.95,
    grain: 0.5,
    angleAt: (x, y) => Math.atan2(y - hy, x - hx) + Math.PI / 2,
    tone: () => vary(rand, t(0.72, 0.08, 42), 0.02, 0.008, 4),
  });
  slab(b, polygon([[U(0.66), U(0.935)], [U(0.765), U(0.935)], [U(0.76), U(1.03)], [U(0.665), U(1.03)]]), lit(b, t(0.8, 0.08, 45), 0.66, 0.105, 0.1), {
    size: U(0.02),
    angle: Math.PI / 2,
  });
  slab(b, ellipse(U(0.7125), U(0.936), U(0.051), U(0.01)), t(0.5, 0.06, 55), { size: U(0.008), stretch: [2, 4], hold: 1 });
  line(b, 0.662, 0.929, 0.763, 0.929, 0.005, t(0.86, 0.07, 48));
  // Steam: two breaths of white, mostly gone.
  const steam = { l: 0.99, c: 0.004, h: 250, a: b.night ? 0.2 : 0.7 };
  line(b, 0.702, 0.917, 0.698, 0.893, 0.006, steam);
  line(b, 0.698, 0.894, 0.704, 0.873, 0.0045, steam);
  line(b, 0.728, 0.914, 0.731, 0.892, 0.0045, steam);
};

const PAINTERS: Record<ThingId, Painter> = { works, badge, plant, record, clock, books, cup };

export function paintThing(ctx: CanvasRenderingContext2D, id: ThingId, u: number, night: boolean, seed: number) {
  PAINTERS[id](brush(ctx, u, night, seed));
}
