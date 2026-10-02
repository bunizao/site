// Palette knife strokes on a 2D canvas. A stroke is a slab of paint dragged
// along its length: a crisp leading edge, a ragged tail where the paint ran
// out, streaks along the drag where the blade's edge scraped it thin, and a
// ridge of light on one lip. Every stroke is built once from a seeded random
// source, so a painting comes out the same on every visit and a stroke can be
// redrawn at any point of its drag while it animates.

export type Rand = () => number;

/** mulberry32: small, fast, and good enough for brushwork. */
export function seeded(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const seedOf = (text: string) => {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return hash >>> 0;
};

export interface Tone {
  l: number;
  c: number;
  h: number;
  a?: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const css = ({ l, c, h, a = 1 }: Tone, dl = 0) =>
  `oklch(${clamp(l + dl, 0, 1).toFixed(3)} ${Math.max(0, c).toFixed(3)} ${h.toFixed(1)} / ${a})`;

/** The same paint, mixed a little differently on the palette each time. */
export const vary = (rand: Rand, tone: Tone, dl = 0.03, dc = 0.012, dh = 5): Tone => ({
  l: tone.l + (rand() - 0.5) * 2 * dl,
  c: Math.max(0, tone.c + (rand() - 0.5) * 2 * dc),
  h: tone.h + (rand() - 0.5) * 2 * dh,
  a: tone.a,
});

interface Streak {
  y: number;
  from: number;
  to: number;
  dl: number;
  alpha: number;
  width: number;
}

export interface Stroke {
  x: number;
  y: number;
  angle: number;
  length: number;
  width: number;
  tone: Tone;
  outline: number[];
  top: number[];
  /** Scrape marks inside the body of paint. */
  streaks: Streak[];
  /** The tail, where the paint ran thin and broke into threads. */
  threads: Streak[];
  grain: number;
  path?: Path2D;
}

/**
 * A stroke that starts at (x, y), the middle of the blade's leading edge, and
 * drags `length` along `angle`. `grain` scales how much the scrape marks show:
 * 1 for an object, lower for a flat field of colour.
 */
export function stroke(rand: Rand, x: number, y: number, angle: number, length: number, width: number, tone: Tone, grain = 1): Stroke {
  const half = width / 2;
  const wobble = width * 0.04;
  const steps = 5;
  // The solid paint stops short of the drag; the two lips never run out at
  // the same place.
  const topEnd = length * (0.74 + rand() * 0.14);
  const bottomEnd = length * (0.7 + rand() * 0.18);
  const top: number[] = [];
  for (let i = 0; i <= steps; i++) top.push((topEnd * i) / steps, -half + (rand() - 0.5) * 2 * wobble);

  const outline = [...top];
  const teeth = 3 + Math.floor(rand() * 3);
  for (let i = 1; i < teeth; i++) {
    const t = i / teeth;
    const reach = topEnd + (bottomEnd - topEnd) * t;
    outline.push(reach - rand() * width * 0.3, -half + width * t + (rand() - 0.5) * width * 0.1);
  }
  for (let i = steps; i >= 0; i--) outline.push((bottomEnd * i) / steps, half + (rand() - 0.5) * 2 * wobble);
  // The leading edge bows a touch, the shape of the blade.
  outline.push(-width * 0.05, 0);

  const streaks: Streak[] = [];
  const count = clamp(Math.round(width / 1.8), 4, 30);
  for (let i = 0; i < count; i++) {
    const sign = rand() < 0.5 ? 1 : -1;
    streaks.push({
      y: -half + rand() * width,
      from: rand() * length * 0.4,
      to: length * (0.5 + rand() * 0.4),
      dl: sign * (0.012 + rand() * 0.035) * grain,
      alpha: 0.18 + rand() * 0.3,
      width: 0.4 + rand() * Math.min(1.4, width / 14),
    });
  }

  // Where the blade lifts, the paint drags out in threads with the ground
  // showing between them.
  const threads: Streak[] = [];
  const reach = Math.max(topEnd, bottomEnd);
  const threadCount = clamp(Math.round((width / 6) * grain), 0, 10);
  for (let i = 0; i < threadCount; i++) {
    threads.push({
      y: -half + width * ((i + 0.2 + rand() * 0.6) / threadCount),
      from: reach * (0.75 + rand() * 0.2),
      to: reach + (length - reach) * (0.2 + rand() * 0.6),
      dl: (rand() - 0.5) * 0.04,
      alpha: 0.5 + rand() * 0.4,
      width: Math.max(0.6, width * (0.04 + rand() * 0.06)),
    });
  }

  return { x, y, angle, length, width, tone, outline, top, streaks, threads, grain };
}

/** A stroke laid through (cx, cy) rather than starting there. */
export function strokeAt(rand: Rand, cx: number, cy: number, angle: number, length: number, width: number, tone: Tone, grain = 1) {
  return stroke(rand, cx - (Math.cos(angle) * length) / 2, cy - (Math.sin(angle) * length) / 2, angle, length, width, tone, grain);
}

const pathOf = (s: Stroke) => {
  if (s.path) return s.path;
  const path = new Path2D();
  path.moveTo(s.outline[0], s.outline[1]);
  for (let i = 2; i < s.outline.length; i += 2) path.lineTo(s.outline[i], s.outline[i + 1]);
  path.closePath();
  s.path = path;
  return path;
};

const lines = (ctx: CanvasRenderingContext2D, s: Stroke, marks: Streak[]) => {
  for (const mark of marks) {
    ctx.strokeStyle = css({ ...s.tone, a: (s.tone.a ?? 1) * mark.alpha }, mark.dl);
    ctx.lineWidth = mark.width;
    ctx.beginPath();
    ctx.moveTo(mark.from, mark.y);
    ctx.lineTo(mark.to, mark.y);
    ctx.stroke();
  }
};

/**
 * Draws a stroke `progress` of the way along its drag (0..1). Anything drawn
 * at a progress below 1 is meant to be wiped and redrawn on the next frame.
 */
export function draw(ctx: CanvasRenderingContext2D, s: Stroke, progress = 1) {
  if (progress <= 0) return;
  const path = pathOf(s);
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.angle);
  if (progress < 1) {
    ctx.beginPath();
    ctx.rect(-s.width, -s.width, s.width + s.length * progress, s.width * 2);
    ctx.clip();
  }
  ctx.fillStyle = css(s.tone);
  ctx.fill(path);
  ctx.lineCap = 'round';
  lines(ctx, s, s.threads);

  ctx.save();
  ctx.clip(path);
  ctx.lineCap = 'butt';
  lines(ctx, s, s.streaks);
  ctx.restore();

  // Light catches the lip the blade pushed up.
  if (s.grain > 0.5) {
    const lip = Math.min(1.2, s.width / 16);
    ctx.lineWidth = lip;
    ctx.strokeStyle = css({ ...s.tone, a: (s.tone.a ?? 1) * 0.3 * s.grain }, 0.06);
    ctx.beginPath();
    for (let i = 0; i < s.top.length; i += 2) ctx.lineTo(s.top[i], s.top[i + 1] + lip / 2);
    ctx.stroke();
  }
  ctx.restore();
}

// One probe context for every hit test: paths are tested in their own
// coordinates, whatever transform the painting canvas carries.
let probe: CanvasRenderingContext2D | null = null;
const probeContext = () => (probe ??= document.createElement('canvas').getContext('2d'));

export interface Region {
  path: Path2D;
  /** x, y, width, height of the box the path sits in. */
  box: [number, number, number, number];
}

export interface Fill {
  /** Blade width, in canvas units. */
  size: number;
  /** Stroke length over width, as a range. */
  stretch?: [number, number];
  angle?: number;
  /** Radians either side of `angle`. */
  jitter?: number;
  /** Paint laid per unit of area; above 1 hides the ground under it. */
  density?: number;
  /** Share of strokes held inside the region; the rest overshoot its edge. */
  hold?: number;
  tone: (x: number, y: number) => Tone;
  /** Overrides `angle` per point, as a stroke following a curve. */
  angleAt?: (x: number, y: number) => number;
  /** How much the scrape marks show; see `stroke`. */
  grain?: number;
  /** Blocks the region in flat first, so no ground shows between strokes. */
  under?: boolean;
}

export const rect = (x: number, y: number, w: number, h: number): Region => {
  const path = new Path2D();
  path.rect(x, y, w, h);
  return { path, box: [x, y, w, h] };
};

export const polygon = (points: [number, number][]): Region => {
  const path = new Path2D();
  points.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
  path.closePath();
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { path, box: [minX, minY, Math.max(...xs) - minX, Math.max(...ys) - minY] };
};

export const ellipse = (cx: number, cy: number, rx: number, ry: number, rotation = 0): Region => {
  const path = new Path2D();
  path.ellipse(cx, cy, rx, ry, rotation, 0, Math.PI * 2);
  const r = Math.max(rx, ry);
  return { path, box: [cx - r, cy - r, r * 2, r * 2] };
};

export const ring = (cx: number, cy: number, outer: number, inner: number): Region => {
  const path = new Path2D();
  path.arc(cx, cy, outer, 0, Math.PI * 2);
  path.arc(cx, cy, inner, 0, Math.PI * 2, true);
  return { path, box: [cx - outer, cy - outer, outer * 2, outer * 2] };
};

/** Covers a region with knife strokes, laid in random order like a painter would. */
export function fill(ctx: CanvasRenderingContext2D, rand: Rand, region: Region, options: Fill) {
  const { size, stretch = [1.6, 3], angle = 0, jitter = 0.25, density = 1.6, hold = 0.7, tone, angleAt, grain = 1, under = true } = options;
  const test = probeContext();
  if (!test) return;
  const [bx, by, bw, bh] = region.box;
  const base = tone(bx + bw / 2, by + bh / 2);
  if (under && (base.a ?? 1) === 1) {
    ctx.fillStyle = css(base);
    ctx.fill(region.path);
  }
  const meanLength = size * ((stretch[0] + stretch[1]) / 2);
  const wanted = Math.ceil((density * bw * bh) / (size * meanLength));
  let laid = 0;
  for (let attempt = 0; attempt < wanted * 4 && laid < wanted; attempt++) {
    const x = bx + rand() * bw;
    const y = by + rand() * bh;
    if (!test.isPointInPath(region.path, x, y)) continue;
    laid++;
    const width = size * (0.7 + rand() * 0.6);
    const length = width * (stretch[0] + rand() * (stretch[1] - stretch[0]));
    const direction = (angleAt ? angleAt(x, y) : angle) + (rand() - 0.5) * 2 * jitter;
    const s = strokeAt(rand, x, y, direction, length, width, tone(x, y), grain);
    if (rand() < hold) {
      ctx.save();
      ctx.clip(region.path);
      draw(ctx, s);
      ctx.restore();
    } else {
      draw(ctx, s);
    }
  }
}

/**
 * The strokes that cover a whole w × h ground, row by row and back and forth,
 * the way a painter tones a canvas. Each one carries the time it starts, as a
 * share of the whole pass (0..1).
 */
export function coat(rand: Rand, w: number, h: number, tone: Tone): { stroke: Stroke; at: number }[] {
  const blade = Math.max(56, Math.min(w, h) * 0.17);
  const reach = Math.max(blade * 3.4, w * 0.62);
  const tilt = -0.09;
  const rows = Math.ceil((h + blade) / (blade * 0.62));
  const strokes: { stroke: Stroke; at: number }[] = [];
  for (let row = 0; row < rows; row++) {
    const y = -blade * 0.3 + row * blade * 0.62;
    const leftward = row % 2 === 1;
    const span = w + blade;
    const count = Math.ceil(span / (reach * 0.72));
    for (let i = 0; i < count; i++) {
      const along = (i / count) * span - blade / 2 + (rand() - 0.5) * blade * 0.4;
      const length = reach * (0.85 + rand() * 0.3);
      const angle = tilt + (rand() - 0.5) * 0.08 + (leftward ? Math.PI : 0);
      const startX = leftward ? w - along : along;
      strokes.push({
        stroke: stroke(rand, startX, y + (rand() - 0.5) * blade * 0.2, angle, length, blade * (0.9 + rand() * 0.3), vary(rand, tone, 0.014, 0.008, 3), 0.55),
        at: 0,
      });
    }
  }
  strokes.forEach((entry, i) => (entry.at = i / strokes.length));
  return strokes;
}

/**
 * A swatch of paint, `width` × `height`, as a data URL. One band of text gets
 * one long drag and a shorter one over it; anything taller is blocked in flat
 * and dragged across band by band, a slab.
 */
export function swatch(width: number, height: number, tone: Tone, seed: number): string {
  const scale = Math.min(devicePixelRatio || 1, 2);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.scale(scale, scale);
  const rand = seeded(seed);
  const bands = Math.max(1, Math.round(height / 40));
  if (bands === 1) {
    const blade = height * 0.86;
    // The solid body ends about three quarters along a stroke, so the drag
    // runs past the edge and the threads fall off the swatch.
    draw(ctx, stroke(rand, height * 0.08, height * 0.52, (rand() - 0.5) * 0.06, (width - height * 0.12) / 0.74, blade, tone));
    draw(ctx, stroke(rand, width * (0.12 + rand() * 0.2), height * 0.5, (rand() - 0.5) * 0.08, width * (0.42 + rand() * 0.3), blade * 0.62, vary(rand, tone, 0.035, 0.015, 4)));
    return canvas.toDataURL();
  }
  const edge = 5;
  ctx.fillStyle = css(tone);
  ctx.fillRect(edge, edge, width * 0.9 - edge, height - edge * 2);
  const band = (height - edge * 2) / bands;
  for (let i = 0; i < bands; i++) {
    const y = edge + band * (i + 0.5);
    draw(ctx, stroke(rand, edge * 0.4, y, (rand() - 0.5) * 0.03, (width - edge) / 0.8, band * 1.24, vary(rand, tone, 0.012, 0.006, 3), 0.6));
  }
  return canvas.toDataURL();
}
