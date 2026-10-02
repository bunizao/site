// Painting a study over with knife strokes. A thing is first drawn as a
// smooth study, gradients and clean edges, which says what it looks like;
// then knife strokes that take their colour from it say how it is painted.
//
// The method is Aaron Hertzmann's, from "Painterly Rendering with Curved
// Brush Strokes of Multiple Sizes" (SIGGRAPH 1998), with a palette knife for
// the brush: a first layer with a wide blade covers the whole thing, then
// each narrower blade goes only where the paint still differs from the study,
// so detail gets small strokes and quiet colour keeps its big ones. A stroke
// runs along the study's edges and stops where its colour turns, and the
// knife now and then carries some white, or a touch of another colour from
// the palette, the way a painter's never comes off quite clean.

import { draw, stroke, vary, type Rand, type Stroke, type Tone } from './knife';

export interface Layer {
  /** Blade width, in canvas units. */
  size: number;
  /** Mean colour difference (RGB distance) a patch may keep before this blade paints over it. */
  threshold: number;
}

export interface Style {
  /** Widest blade first. */
  layers: Layer[];
  /** Stroke length over blade width, as a range. */
  stretch?: [number, number];
  /** Direction where the study is flat and there is no edge to follow. */
  angle?: number;
  /** Radians either side of `angle`. */
  jitter?: number;
  grain?: number;
  /** How far the first, widest layer may spill past the silhouette, in canvas units. */
  spill?: number;
  /** Colours a stroke now and then picks up from elsewhere on the palette. */
  accents?: Tone[];
  accentShare?: number;
  /** Share of strokes that carry some white streaked through them. */
  whiteShare?: number;
}

type Sat = Uint32Array;

/** Summed-area tables of premultiplied red, green, blue and alpha. */
function summed(data: Uint8ClampedArray, w: number, h: number): Sat[] {
  const stride = w + 1;
  const tables = [0, 1, 2, 3].map(() => new Uint32Array(stride * (h + 1)));
  for (let y = 0; y < h; y++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const alpha = data[i + 3];
      r += (data[i] * alpha) / 255;
      g += (data[i + 1] * alpha) / 255;
      b += (data[i + 2] * alpha) / 255;
      a += alpha;
      const at = (y + 1) * stride + x + 1;
      const above = y * stride + x + 1;
      tables[0][at] = tables[0][above] + r;
      tables[1][at] = tables[1][above] + g;
      tables[2][at] = tables[2][above] + b;
      tables[3][at] = tables[3][above] + a;
    }
  }
  return tables;
}

const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** sRGB (0–255) to OKLCH. */
export function toneOf(r: number, g: number, b: number): Tone {
  const lr = linear(r / 255);
  const lg = linear(g / 255);
  const lb = linear(b / 255);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const h = (Math.atan2(B, A) * 180) / Math.PI;
  return { l: L, c: Math.hypot(A, B), h: h < 0 ? h + 360 : h };
}

function shuffle<T>(rand: Rand, list: T[]) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/**
 * Paints `study` over with knife strokes onto `ctx`. The study is a 1× canvas
 * whose (0, 0) sits at `origin` in the coordinates `ctx` draws in; `ctx`'s
 * own canvas must cover the same area, at any pixel density.
 */
export function paintOver(ctx: CanvasRenderingContext2D, study: HTMLCanvasElement, origin: [number, number], style: Style, rand: Rand) {
  const w = study.width;
  const h = study.height;
  const studyCtx = study.getContext('2d');
  if (!w || !h || !studyCtx) return;
  const [ox, oy] = origin;
  const { stretch = [1.6, 3.4], angle: rest = -0.08, jitter = 0.35, grain = 1, spill = Infinity, accents = [], accentShare = 0, whiteShare = 0.4 } = style;
  const [R, G, B, A] = summed(studyCtx.getImageData(0, 0, w, h).data, w, h);
  const stride = w + 1;
  const device = ctx.canvas;
  const k = device.width / w;

  /** Mean of the study over a box around (x, y): premultiplied colour and coverage. */
  const mean = (x: number, y: number, r: number) => {
    const x0 = Math.max(0, Math.min(w, Math.round(x - r)));
    const x1 = Math.max(0, Math.min(w, Math.round(x + r) + 1));
    const y0 = Math.max(0, Math.min(h, Math.round(y - r)));
    const y1 = Math.max(0, Math.min(h, Math.round(y + r) + 1));
    const area = Math.max(1, (x1 - x0) * (y1 - y0));
    const box = (t: Sat) => (t[y1 * stride + x1] - t[y0 * stride + x1] - t[y1 * stride + x0] + t[y0 * stride + x0]) / area;
    return { r: box(R), g: box(G), b: box(B), a: box(A) / 255 };
  };

  /** The study's colour at (x, y), blurred to the blade, and how much of it is there. */
  const colourAt = (x: number, y: number, r: number) => {
    const m = mean(x, y, r);
    const a = Math.max(m.a, 1e-3);
    return { r: m.r / a, g: m.g / a, b: m.b / a, a: m.a };
  };

  const luma = (x: number, y: number, r: number) => {
    const m = mean(x, y, r);
    return (0.3 * m.r + 0.59 * m.g + 0.11 * m.b) / 255 + m.a * 0.5;
  };

  const makeStroke = (x: number, y: number, layer: Layer, mixed: boolean): Stroke => {
    const blade = layer.size;
    const r = Math.max(1, blade * 0.45);
    const here = colourAt(x, y, r);
    // Along the edges and the turn of the form: across the study's gradient.
    const gx = luma(x + r, y, r) - luma(x - r, y, r);
    const gy = luma(x, y + r, r) - luma(x, y - r, r);
    const edge = Math.hypot(gx, gy) > 0.05;
    const angle = edge ? Math.atan2(gy, gx) + Math.PI / 2 + (rand() - 0.5) * 0.24 : rest + (rand() - 0.5) * 2 * jitter;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    // Reach each way until the colour turns or the thing ends.
    const step = Math.max(1, blade * 0.5);
    const most = (blade * stretch[1]) / 2;
    const limit = Math.max(18, layer.threshold * 1.4);
    const reach = (sign: number) => {
      let far = 0;
      for (let d = step; d <= most; d += step) {
        const there = colourAt(x + dx * d * sign, y + dy * d * sign, r);
        if (there.a < 0.5 || Math.hypot(there.r - here.r, there.g - here.g, there.b - here.b) > limit) break;
        far = d;
      }
      return far;
    };
    let back = reach(-1);
    let ahead = reach(1);
    const least = (blade * stretch[0]) / 2;
    if (back + ahead < least * 2) {
      const grow = least - (back + ahead) / 2;
      back += grow;
      ahead += grow;
    }
    // A knife goes either way; its threads trail behind it.
    const forward = rand() < 0.5;
    const startX = forward ? x - dx * back : x + dx * ahead;
    const startY = forward ? y - dy * back : y + dy * ahead;
    const length = (back + ahead + blade * 0.2) / 0.82;

    let tone = vary(rand, toneOf(here.r, here.g, here.b), 0.022, 0.01, 4);
    if (mixed && accents.length && rand() < accentShare) {
      const accent = accents[Math.floor(rand() * accents.length)];
      tone = { l: tone.l + (rand() - 0.5) * 0.04, c: accent.c, h: accent.h };
    }
    const white = rand() < whiteShare ? { l: Math.min(0.98, tone.l + 0.1), c: tone.c * 0.45, h: tone.h } : undefined;
    return stroke(rand, ox + startX, oy + startY, forward ? angle : angle + Math.PI, length, blade * (0.8 + rand() * 0.35), tone, grain, white);
  };

  style.layers.forEach((layer, index) => {
    const grid = Math.max(2, Math.round(layer.size));
    const r = Math.max(1, layer.size * 0.45);
    const first = index === 0;
    // The finest blade is the painter's last word: it lays clean colour, or
    // the stray colours read as flecks rather than broken colour.
    const mixed = index < style.layers.length - 1;
    const painted = first ? null : ctx.getImageData(0, 0, device.width, device.height).data;
    const sample = Math.max(1, Math.floor(grid / 5));
    const strokes: Stroke[] = [];

    for (let cy = 0; cy < h; cy += grid) {
      for (let cx = 0; cx < w; cx += grid) {
        let total = 0;
        let count = 0;
        let worst = -1;
        let wx = 0;
        let wy = 0;
        for (let y = cy; y < Math.min(h, cy + grid); y += sample) {
          for (let x = cx; x < Math.min(w, cx + grid); x += sample) {
            const want = colourAt(x, y, r);
            if (want.a < 0.5) continue;
            let error = 255;
            if (painted) {
              const i = (Math.min(device.height - 1, Math.round(y * k)) * device.width + Math.min(device.width - 1, Math.round(x * k))) * 4;
              if (painted[i + 3] > 200) error = Math.hypot(painted[i] - want.r, painted[i + 1] - want.g, painted[i + 2] - want.b);
            }
            // A little noise, so ties do not all land on the cell's corner.
            const score = error + rand() * 4;
            total += error;
            count++;
            if (score > worst) {
              worst = score;
              wx = x;
              wy = y;
            }
          }
        }
        if (count && total / count > layer.threshold) strokes.push(makeStroke(wx + rand() - 0.5, wy + rand() - 0.5, layer, mixed));
      }
    }

    for (const s of shuffle(rand, strokes)) draw(ctx, s);

    // The widest blade overshoots the most; trim it back to the silhouette,
    // with a little room so its edge stays a knife's edge.
    if (first && Number.isFinite(spill)) {
      const mask = document.createElement('canvas');
      mask.width = device.width;
      mask.height = device.height;
      const maskCtx = mask.getContext('2d');
      if (!maskCtx) return;
      maskCtx.setTransform(k, 0, 0, k, 0, 0);
      for (let i = 0; i < 8; i++) {
        const turn = (i / 8) * Math.PI * 2;
        maskCtx.drawImage(study, Math.cos(turn) * spill, Math.sin(turn) * spill);
      }
      maskCtx.drawImage(study, 0, 0);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(mask, 0, 0);
      ctx.restore();
    }
  });
}
