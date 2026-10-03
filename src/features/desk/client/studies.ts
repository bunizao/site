// Small knife studies for the projects: each project's hero, reduced to a
// few slabs of paint. A cube for the CLI tools, a fan of share cards for
// ogis, a typeset page for Attegi, and waves for the proxy rules. Also the
// turntable on the listening tab: its deck, its arm, its start key, the
// record it turns and the light that sits on the record.

import { DECK } from '../shared/deck';
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

// The turntable the record sits on, from above: a walnut plinth, a bone
// enamel top plate, the platter's rim with its strobe dots, the arm's base
// and rest, the cue lever, the speed keys and the strobe lamp. The record,
// the arm and the start key are their own canvases over it (ui/Turntable.astro).
const metal = (t: (l: number, c: number, h: number) => Tone, l: number) => t(l, 0.006, 250);
/** Where the arm's tube meets the headshell, from the pivot. */
const ARM_JOINT: [number, number] = [0.03, 0.4];

const deck: Study = (ctx, rand, w, h, t) => {
  const u = (n: number) => n * w;
  const { platter, pivot } = DECK;
  fill(ctx, rand, rect(0, 0, w, h), { size: u(0.03), stretch: [5, 9], jitter: 0.03, density: 1.8, hold: 1, tone: () => vary(rand, t(0.42, 0.07, 50), 0.05, 0.015, 6) });
  const inset = u(0.026);
  fill(ctx, rand, rect(inset, inset, w - inset * 2, h - inset * 2), { size: u(0.04), stretch: [3, 6], jitter: 0.03, density: 1.8, hold: 1, tone: () => vary(rand, t(0.9, 0.018, 85), 0.014, 0.006, 4) });

  // The platter stands proud of the plate, and the light comes from the top left.
  const cast = (x: number, y: number, r: number) =>
    fill(ctx, rand, ellipse(u(x + 0.008), u(y + 0.012), u(r), u(r)), {
      size: u(0.014),
      stretch: [3, 5],
      jitter: 0.05,
      density: 1.6,
      hold: 0.97,
      under: false,
      angleAt: (px, py) => Math.atan2(py - u(y), px - u(x)) + Math.PI / 2,
      tone: () => vary(rand, t(0.8, 0.02, 75), 0.012, 0.004, 4),
    });
  cast(platter.x, platter.y, platter.r + 0.004);
  const around = (x: number, y: number) => Math.atan2(y - u(platter.y), x - u(platter.x)) + Math.PI / 2;
  fill(ctx, rand, ring(u(platter.x), u(platter.y), u(platter.r), u(DECK.record - 0.006)), {
    size: u(0.012),
    stretch: [4, 7],
    jitter: 0.04,
    density: 2.4,
    hold: 1,
    angleAt: around,
    tone: () => vary(rand, metal(t, 0.66), 0.03, 0.004, 6),
  });
  // The strobe dots, which stand still when the speed is right.
  for (let i = 0; i < 90; i++) {
    const at = (i / 90) * Math.PI * 2;
    const x = u(platter.x) + Math.cos(at) * u(platter.r - 0.008);
    const y = u(platter.y) + Math.sin(at) * u(platter.r - 0.008);
    draw(ctx, stroke(rand, x, y, at + Math.PI / 2, u(0.006), u(0.006), metal(t, 0.4), 0.2));
  }
  for (let i = 0; i < 14; i++) {
    const at = -2.3 + (rand() - 0.5) * 0.7;
    const x = u(platter.x) + Math.cos(at) * u(platter.r - 0.012);
    const y = u(platter.y) + Math.sin(at) * u(platter.r - 0.012);
    draw(ctx, stroke(rand, x, y, at + Math.PI / 2, u(0.03 + rand() * 0.04), u(0.006), { l: 1, c: 0, h: 0, a: 0.35 + rand() * 0.3 }, 0.3));
  }

  // The arm's base, and the rest it hangs on.
  cast(pivot.x, pivot.y, 0.068);
  fill(ctx, rand, ellipse(u(pivot.x), u(pivot.y), u(0.066), u(0.066)), { size: u(0.014), stretch: [2, 4], jitter: 0.2, density: 2.4, hold: 0.96, tone: () => vary(rand, metal(t, 0.78), 0.03, 0.004, 6) });
  fill(ctx, rand, ring(u(pivot.x), u(pivot.y), u(0.066), u(0.056)), { size: u(0.008), stretch: [3, 5], jitter: 0.04, density: 1.4, hold: 1, under: false, angleAt: (x, y) => Math.atan2(y - u(pivot.y), x - u(pivot.x)) + Math.PI / 2, tone: () => vary(rand, metal(t, 0.6), 0.03, 0.004, 6) });
  // Under the tube, which leans out a little (see `arm`).
  const rest = { x: pivot.x + ARM_JOINT[0] * 0.9, y: pivot.y + ARM_JOINT[1] * 0.9 };
  fill(ctx, rand, ellipse(u(rest.x), u(rest.y), u(0.02), u(0.02)), { size: u(0.008), stretch: [1.4, 2.4], jitter: 0.5, density: 2.4, hold: 0.95, tone: () => vary(rand, metal(t, 0.3), 0.03, 0.004, 6) });
  for (const side of [-1, 1]) draw(ctx, stroke(rand, u(rest.x + side * 0.016), u(rest.y - 0.016), Math.PI / 2, u(0.03), u(0.007), metal(t, 0.24), 0.3));

  // The cue lever.
  fill(ctx, rand, rect(u(0.928), u(0.255), u(0.032), u(0.07)), { size: u(0.008), stretch: [2, 3], angle: Math.PI / 2, jitter: 0.06, density: 2.4, hold: 1, tone: () => vary(rand, metal(t, 0.74), 0.03, 0.004, 6) });
  draw(ctx, stroke(rand, u(0.944), u(0.29), -0.5, u(0.04), u(0.008), metal(t, 0.28), 0.3));

  // The speed keys, 33 and 45, under the headshell at rest.
  for (const x of [0.836, 0.9]) {
    fill(ctx, rand, rect(u(x), u(0.712), u(0.052), u(0.03)), { size: u(0.008), stretch: [3, 5], jitter: 0.03, density: 2.4, hold: 1, tone: () => vary(rand, metal(t, 0.8), 0.03, 0.004, 6) });
    draw(ctx, stroke(rand, u(x + 0.004), u(0.738), 0, u(0.044), u(0.005), metal(t, 0.5), 0.3));
  }

  // The strobe lamp's bezel; its light is a layer over it.
  fill(ctx, rand, ellipse(u(0.075), u(0.615), u(0.024), u(0.024)), { size: u(0.008), stretch: [1.4, 2.4], jitter: 0.5, density: 2.4, hold: 0.95, tone: () => vary(rand, metal(t, 0.3), 0.03, 0.004, 6) });
  fill(ctx, rand, ellipse(u(0.075), u(0.615), u(0.014), u(0.014)), { size: u(0.006), stretch: [1.2, 2], jitter: 0.6, density: 2.4, hold: 0.95, tone: () => vary(rand, t(0.5, 0.06, 40), 0.03, 0.01, 6) });
};

// The tonearm, hanging straight down from its pivot: the counterweight
// behind, the bearing, the tube, and the headshell turned in toward the
// spindle with the cartridge on it and the finger lift off its side. The
// stylus is exactly an arm's length below the pivot.
const arm: Study = (ctx, rand, w, _h, t) => {
  const { box } = DECK;
  const u = w / (box.left + box.right);
  const at = (x: number, y: number): [number, number] => [(box.left + x) * u, (box.top + y) * u];
  const slab = (points: [number, number][], tone: Tone, angle: number, size = 0.006) =>
    fill(ctx, rand, polygon(points.map(([x, y]) => at(x, y))), { size: size * u, stretch: [3, 6], angle, jitter: 0.04, density: 2.6, hold: 1, tone: () => vary(rand, tone, 0.025, 0.004, 6) });

  // The counterweight, ridged, on its stub.
  slab([[-0.007, -0.07], [0.007, -0.07], [0.007, 0], [-0.007, 0]], metal(t, 0.7), Math.PI / 2);
  slab([[-0.034, -0.118], [0.034, -0.118], [0.034, -0.058], [-0.034, -0.058]], metal(t, 0.26), 0, 0.01);
  for (let i = 0; i < 5; i++) {
    const [x, y] = at(-0.03, -0.108 + i * 0.011);
    draw(ctx, stroke(rand, x, y, 0, u * 0.06, u * 0.003, metal(t, 0.42), 0.2));
  }

  // The tube, leaning a little out so the headshell can turn back in.
  const joint = ARM_JOINT;
  const stylus: [number, number] = [0, DECK.arm];
  const lean = Math.atan2(joint[1], joint[0]);
  const half = 0.0075;
  const nx = Math.sin(lean) * half;
  const ny = -Math.cos(lean) * half;
  slab([[-nx, -ny], [nx, ny], [joint[0] + nx, joint[1] + ny], [joint[0] - nx, joint[1] - ny]], metal(t, 0.8), lean);
  const [hx, hy] = at(-nx * 0.5, 0.02);
  draw(ctx, stroke(rand, hx, hy, lean, u * 0.36, u * 0.0035, { l: 1, c: 0, h: 0, a: 0.6 }, 0.3));

  // The headshell, from the end of the tube to a little past the stylus.
  const dx = stylus[0] - joint[0];
  const dy = stylus[1] - joint[1];
  const length = Math.hypot(dx, dy);
  const along = (s: number, side: number): [number, number] => [joint[0] + (dx / length) * s - (dy / length) * side, joint[1] + (dy / length) * s + (dx / length) * side];
  const turn = Math.atan2(dy, dx);
  slab([along(-0.008, -0.017), along(-0.008, 0.017), along(length + 0.018, 0.019), along(length + 0.018, -0.019)], metal(t, 0.3), turn, 0.008);
  slab([along(0.012, -0.004), along(0.012, -0.016), along(0.04, -0.034), along(0.046, -0.028)], metal(t, 0.72), turn + 0.6, 0.005);
  slab([along(length - 0.044, -0.013), along(length - 0.044, 0.013), along(length + 0.008, 0.013), along(length + 0.008, -0.013)], t(0.4, 0.08, 25), turn, 0.006);

  // The bearing, over everything.
  fill(ctx, rand, ellipse(...at(0, 0), u * 0.03, u * 0.03), { size: u * 0.008, stretch: [1.4, 2.4], jitter: 0.6, density: 2.6, hold: 0.95, tone: () => vary(rand, metal(t, 0.84), 0.03, 0.004, 6) });
  fill(ctx, rand, ellipse(...at(0, 0), u * 0.013, u * 0.013), { size: u * 0.005, stretch: [1.2, 2], jitter: 0.6, density: 2.4, hold: 0.95, tone: () => vary(rand, metal(t, 0.3), 0.03, 0.004, 6) });
};

// The start key: a slab of brushed metal, pressed in while the record turns.
const key: Study = (ctx, rand, w, h, t) => {
  fill(ctx, rand, rect(0, 0, w, h), { size: h * 0.3, stretch: [3, 6], jitter: 0.03, density: 2.4, hold: 1, tone: () => vary(rand, metal(t, 0.8), 0.03, 0.004, 6) });
  draw(ctx, stroke(rand, w * 0.08, h * 0.16, 0, w * 0.84, h * 0.08, { l: 1, c: 0, h: 0, a: 0.5 }, 0.3));
  draw(ctx, stroke(rand, w * 0.06, h * 0.86, 0, w * 0.88, h * 0.1, metal(t, 0.5), 0.3));
};

// The back of an envelope (ui/Letter.astro): its paper, the bottom flap and
// the side flaps folded in, and the seams between them. The top flap is its
// own canvas, which opens and shuts over it.
const PAPER = (t: (l: number, c: number, h: number) => Tone, dl = 0) => t(0.93 + dl, 0.03, 78);

const envelope: Study = (ctx, rand, w, h, t) => {
  fill(ctx, rand, rect(0, 0, w, h), { size: h * 0.12, stretch: [3, 5], jitter: 0.06, density: 2, hold: 1, tone: () => vary(rand, PAPER(t), 0.012, 0.006, 3) });
  // The bottom flap, folded up over the side flaps, a shade lighter where it catches the light.
  const tip = h * 0.42;
  fill(ctx, rand, polygon([[0, h], [w * 0.5, tip], [w, h]]), { size: h * 0.1, stretch: [3, 5], angle: -0.3, jitter: 0.1, density: 2.2, hold: 0.98, tone: () => vary(rand, PAPER(t, 0.025), 0.01, 0.005, 3) });
  for (const [x0, y0, x1, y1] of [[0, h, w * 0.5, tip], [w, h, w * 0.5, tip]]) {
    const angle = Math.atan2(y1 - y0, x1 - x0);
    draw(ctx, stroke(rand, x0, y0, angle, Math.hypot(x1 - x0, y1 - y0), h * 0.012, PAPER(t, -0.12), 0.3));
  }
};

// The top flap, shut, pointing down from the envelope's top edge.
const flap: Study = (ctx, rand, w, h, t) => {
  fill(ctx, rand, polygon([[0, 0], [w, 0], [w * 0.5, h]]), { size: h * 0.16, stretch: [3, 5], angle: 0.25, jitter: 0.1, density: 2.4, hold: 0.98, tone: () => vary(rand, PAPER(t, -0.015), 0.012, 0.005, 3) });
  for (const [x0, x1] of [[0, w * 0.5], [w, w * 0.5]]) {
    const angle = Math.atan2(h, x1 - x0);
    draw(ctx, stroke(rand, x0, h * 0.01, angle, Math.hypot(x1 - x0, h), h * 0.02, PAPER(t, -0.1), 0.3));
  }
};

// A seal of red wax, pressed: a blob with a rim pushed up round the die.
const seal: Study = (ctx, rand, w, _h, t) => {
  const c = w / 2;
  const r = w * 0.46;
  const wax = t(0.46, 0.15, 22);
  const around = (x: number, y: number) => Math.atan2(y - c, x - c) + Math.PI / 2;
  fill(ctx, rand, ellipse(c, c, r, r * 0.96, rand()), { size: r * 0.22, stretch: [1.4, 2.4], jitter: 0.8, density: 2.6, hold: 0.82, tone: () => vary(rand, wax, 0.04, 0.02, 4) });
  fill(ctx, rand, ring(c, c, r * 0.8, r * 0.62), { size: r * 0.1, stretch: [3, 5], jitter: 0.05, density: 2, hold: 1, under: false, angleAt: around, tone: () => vary(rand, { ...wax, l: wax.l - 0.08 }, 0.03, 0.02, 4) });
  fill(ctx, rand, ellipse(c, c, r * 0.62, r * 0.62), { size: r * 0.14, stretch: [1.4, 2.4], jitter: 0.6, density: 2.4, hold: 0.96, tone: () => vary(rand, { ...wax, l: wax.l + 0.04 }, 0.03, 0.02, 4) });
  for (let i = 0; i < 4; i++) {
    const at = -2.4 + (rand() - 0.5) * 0.6;
    draw(ctx, stroke(rand, c + Math.cos(at) * r * 0.72, c + Math.sin(at) * r * 0.72, at + Math.PI / 2, r * 0.3, r * 0.06, { l: 1, c: 0, h: 0, a: 0.28 }, 0.3));
  }
};

const STUDIES: Record<string, Study> = { cube, carousel, tour, waves, vinyl, shine, deck, arm, key, envelope, flap, seal };

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
