/**
 * Paints the sillage sea footer: the art in public/sillage/{light,dark,
 * dusk-light,dusk-dark}/ and the motion data the component animates it with.
 *
 *   bun scripts/paint-sillage.ts
 *
 * The medium is crayon on toothed paper, and the inks are the blog's own:
 * every colour below is mixed from `blogPalette`, so the painting and the
 * links around it are the same three blues. Change a token, re-run, and the
 * sea follows.
 *
 * How a surface gets painted, in the order a pastel artist works:
 *   1. a toned ground, mottled, so nothing is ever flat fill;
 *   2. crayon strokes over it — pigment lands only where the stroke's pressure
 *      beats the height of the paper under it (`deposit`), so the ground shows
 *      through in flecks, the way the mockup's sea does;
 *   3. a last light pass for the few places that catch the sky.
 * White paper is almost never what shows through: that reads as static, not as
 * crayon. The first attempt did exactly that.
 *
 * Deterministic: the same seed paints the same picture. Night is the same
 * composition repainted in a night palette, not a filter over day.
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { blogPalette } from '@/data/site';
import { surfaceDepth, type Swell } from '@/features/posts/ui/sillage-surface';

// --- Geometry ---------------------------------------------------------------
// CSS px at desktop scale. The component multiplies all of it by --s and reads
// it from sillage-motion.json, so this is the only place any of it is written.

/** Width of one seamless repeat of every drifting strip. */
const TILE = 1600;
/** Near sea strip: the water the boat floats in, down to the page floor. */
const NEAR_H = 120;
/** Mean depth of the near surface below the strip's top edge. */
const SURFACE = 30;
/** How far the back swell's mean surface stands above the near one. */
const BACK_RISE = 12;
/** Air above the back swell's mean surface: room for its crests. */
const BACK_HEADROOM = 16;
/** The back swell is further off, so it drifts slower: parallax. */
const BACK_PERIOD_RATIO = 1.55;
/** The front row: the nearest water, a second wave line across the lower sea. */
const FRONT_H = 66;
const FRONT_SURFACE = 22;
/** Nearer, so faster past. */
const FRONT_PERIOD_RATIO = 0.68;
const CLOUD_FLOOR = 112;
const CLOUD_H = 110;
/** Seconds for the near sea to drift one tile. Sets the whole tempo. */
const PERIOD = 46;
/** Where the boat sits on the near tile when the animation starts. */
const BOAT_TILE_X = 988;

// The boat sprite in its own coordinates: origin on the waterline at the hull's
// centre, y up. The box is what gets painted; the origin is what rides the sea.
const BOAT_BOX = { left: -50, right: 54, bottom: -24, top: 116 };
const STERN_X = -37;
/** Where the stem meets the water. */
const BOW_X = 35;
const HULL_HALF = 34;
const LANTERN = { x: -41, y: 28 };
/** How far the hull sits below the averaged surface: a laden boat, not a cork. */
const DRAFT = 3;

const FOAM_COUNT = 30;
const FOAM_W = 96;
const FOAM_H = 12;
const FOAM_VARIANTS = 6;
/** Share of a period a foam streak stays visible while it drifts astern. */
const FOAM_LIFE = 0.27;

const STRIP_RES = 2;
const SPRITE_RES = 3;

// The swell: [waves per tile, amplitude px, phase]. Integer wave counts keep the
// tile seamless; unrelated counts keep the boat's ride from visibly repeating.
// The long waves carry the boat; the short ones are the chop that breaks white.
const SWELL: Swell = [
  [3, 2.4, 0.7],
  [5, 4.6, 2.1],
  [7, 2.8, 4.4],
  [11, 1.6, 1.3],
  [17, 1.1, 5.2],
  [23, 0.8, 4.1],
  [31, 0.45, 3.0],
];
const LEAN = 0.24;

// The back swell: longer, lower waves, in counts that share nothing with the
// near ones, so the two profiles never line up.
const BACK_SWELL: Swell = [
  [4, 2.2, 1.9],
  [6, 3.2, 0.4],
  [9, 1.9, 3.3],
  [13, 1.0, 5.8],
  [23, 0.5, 2.2],
];
const BACK_LEAN = 0.12;

// The front row is the closest water, so its waves are the tallest and the
// choppiest, and they lean the hardest.
const FRONT_SWELL: Swell = [
  [4, 3.0, 1.1],
  [6, 2.4, 3.9],
  [9, 2.2, 0.3],
  [14, 1.5, 2.7],
  [19, 1.1, 5.1],
  [27, 0.6, 1.8],
];
const FRONT_LEAN = 0.32;

const surfaceAt = (x: number) => surfaceDepth(SWELL, SURFACE, LEAN, TILE, x);
const backSurfaceAt = (x: number) => surfaceDepth(BACK_SWELL, BACK_HEADROOM, BACK_LEAN, TILE, x);
const frontSurfaceAt = (x: number) => surfaceDepth(FRONT_SWELL, FRONT_SURFACE, FRONT_LEAN, TILE, x);

// The back strip only has to reach down to where the near sea can never
// uncover it; everything below that would be bytes nobody sees.
const DEEPEST_SURFACE = Math.max(...Array.from({ length: TILE }, (_, x) => surfaceAt(x)));
const BACK_FLOOR = Math.floor(NEAR_H - DEEPEST_SURFACE - 6);
const BACK_H = NEAR_H - SURFACE + BACK_RISE + BACK_HEADROOM - BACK_FLOOR;

// --- Inks -------------------------------------------------------------------

type RGB = [number, number, number];

const hex = (value: string): RGB => [
  parseInt(value.slice(1, 3), 16) / 255,
  parseInt(value.slice(3, 5), 16) / 255,
  parseInt(value.slice(5, 7), 16) / 255,
];
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** The sticks one body of water is painted with. */
interface Water {
  /** Ground under the strokes; what shows through the paper's tooth. */
  ground: RGB;
  light: RGB;
  mid: RGB;
  deep: RGB;
  /** The profile's edge where it catches the sky, and the glints. */
  crest: RGB;
}

interface Palette {
  paper: RGB;
  front: Water;
  near: Water;
  back: Water;
  cloud: RGB;
  cloudLight: RGB;
  cloudShade: RGB;
  hull: RGB;
  hullDark: RGB;
  hullEdge: RGB;
  sail: RGB;
  sailShade: RGB;
  line: RGB;
  mast: RGB;
  flag: RGB;
  lantern: RGB;
  /** Thrown water. By day it has to read against white paper, so it is blue,
      not the white of the foam it comes from. */
  spray: RGB;
  /** Pressure multiplier for the sky: clouds are lit by a sky that is gone at night. */
  sky: number;
  /** What the sea keeps under it, and what flies over it. */
  dolphin: RGB;
  dolphinBelly: RGB;
  fish: RGB;
  bird: RGB;
  star: RGB;
  /** Dusk only: the low sun, the haze round it and its road on the water,
      and the sky's colour from the horizon up. */
  sun: RGB;
  sunRim: RGB;
  halo: RGB;
  glitter: RGB;
  dusk: DuskSky;
}

/** The dusk sky: its colours by height over the far swell (0 to 1 of the
    strip's sky), how much of it lies on the page at the horizon, and how hard
    the few crayon strokes along the horizon go on. */
interface DuskSky {
  colors: [number, RGB][];
  wash: number;
  strokes: number;
}

function palettes(): Record<'light' | 'dark' | 'dusk-light' | 'dusk-dark', Palette> {
  const white: RGB = [1, 1, 1];
  const night = hex('#0a0a0a');
  const dai = { light: hex(blogPalette.dai.light), dark: hex(blogPalette.dai.dark) };
  const dian = { light: hex(blogPalette.dian.light), dark: hex(blogPalette.dian.dark) };
  const ji = { light: hex(blogPalette.ji.light), dark: hex(blogPalette.ji.dark) };

  // Sea ink is 黛 with a little 霁 in it: the slate of the links, carrying
  // enough clear blue to read as water rather than as ink.
  const sea = mix(dai.light, ji.light, 0.36);
  const light: Palette = {
    paper: white,
    // Nearest, so the deepest blue: aerial perspective runs front to back.
    front: {
      ground: mix(sea, white, 0.34),
      light: mix(sea, white, 0.56),
      mid: mix(sea, white, 0.2),
      deep: mix(mix(sea, dian.light, 0.38), white, 0.1),
      crest: mix(ji.light, white, 0.88),
    },
    near: {
      ground: mix(sea, white, 0.5),
      light: mix(sea, white, 0.66),
      mid: mix(sea, white, 0.34),
      deep: mix(mix(sea, dian.light, 0.3), white, 0.18),
      crest: mix(ji.light, white, 0.9),
    },
    // Further off, so paler: the air between takes the colour out of it.
    back: {
      ground: mix(sea, white, 0.72),
      light: mix(sea, white, 0.84),
      mid: mix(sea, white, 0.6),
      deep: mix(sea, white, 0.5),
      crest: mix(ji.light, white, 0.94),
    },
    cloud: mix(mix(dai.light, ji.light, 0.5), white, 0.84),
    cloudLight: mix(ji.light, white, 0.95),
    cloudShade: mix(dai.light, white, 0.7),
    hull: mix(dian.light, white, 0.2),
    hullDark: dian.light,
    hullEdge: mix(dian.light, white, 0.5),
    sail: mix(dai.light, white, 0.95),
    sailShade: mix(mix(dai.light, ji.light, 0.3), white, 0.8),
    line: mix(dai.light, dian.light, 0.3),
    mast: dian.light,
    flag: ji.light,
    lantern: mix(dian.light, white, 0.3),
    spray: mix(sea, white, 0.3),
    sky: 1,
    dolphin: mix(dai.light, white, 0.4),
    dolphinBelly: mix(ji.light, white, 0.9),
    fish: mix(ji.light, white, 0.4),
    bird: mix(dai.light, dian.light, 0.3),
    star: mix(ji.light, white, 0.6),
    sun: white,
    sunRim: white,
    halo: white,
    glitter: white,
    dusk: { colors: [], wash: 0, strokes: 0 },
  };

  // Night is pastel on black paper: the pigment is lighter than the ground, so
  // the same strokes read as moonlight on water instead of ink on it.
  const seaNight = mix(dai.dark, dian.dark, 0.3);
  const dark: Palette = {
    paper: night,
    front: {
      ground: mix(night, seaNight, 0.22),
      light: mix(night, seaNight, 0.5),
      mid: mix(night, seaNight, 0.32),
      deep: mix(night, dian.dark, 0.17),
      crest: mix(night, mix(ji.dark, white, 0.5), 0.84),
    },
    near: {
      ground: mix(night, seaNight, 0.17),
      light: mix(night, seaNight, 0.42),
      mid: mix(night, seaNight, 0.26),
      deep: mix(night, dian.dark, 0.13),
      crest: mix(night, mix(ji.dark, white, 0.5), 0.78),
    },
    back: {
      ground: mix(night, seaNight, 0.1),
      light: mix(night, seaNight, 0.24),
      mid: mix(night, seaNight, 0.15),
      deep: mix(night, dian.dark, 0.08),
      crest: mix(night, mix(ji.dark, white, 0.4), 0.46),
    },
    cloud: mix(night, dai.dark, 0.08),
    cloudLight: mix(night, dai.dark, 0.15),
    cloudShade: mix(night, dai.dark, 0.05),
    hull: mix(night, dian.dark, 0.24),
    hullDark: mix(night, dian.dark, 0.14),
    hullEdge: mix(night, dai.dark, 0.5),
    sail: mix(night, dai.dark, 0.46),
    sailShade: mix(night, dai.dark, 0.3),
    line: mix(night, dai.dark, 0.66),
    mast: mix(night, dai.dark, 0.56),
    flag: mix(night, ji.dark, 0.8),
    lantern: mix(ji.dark, white, 0.8),
    spray: mix(night, mix(ji.dark, white, 0.5), 0.78),
    sky: 0.55,
    dolphin: mix(night, dai.dark, 0.42),
    dolphinBelly: mix(night, mix(ji.dark, white, 0.5), 0.66),
    fish: mix(night, mix(ji.dark, white, 0.4), 0.8),
    bird: mix(night, dai.dark, 0.6),
    star: mix(ji.dark, white, 0.72),
    sun: white,
    sunRim: white,
    halo: white,
    glitter: white,
    dusk: { colors: [], wash: 0, strokes: 0 },
  };

  // Dusk, at the owner's asking ("黄昏时的大海"), is the one place the blog's
  // no-warm-accents rule gives way: the sun is down to the water and the sky
  // is in the sea. The blues go violet, the crests take the light, and the
  // far water, which mirrors the most sky, goes rose.
  const violet = hex('#5d62a4');
  const indigo = hex('#40467f');
  const mauve = hex('#b494bb');
  const rose = hex('#f0a492');
  const peach = hex('#ffd6b0');
  const gold = hex('#ffcf8a');
  const duskLight: Palette = {
    paper: white,
    front: {
      ground: mix(violet, white, 0.3),
      light: mix(violet, white, 0.5),
      mid: mix(violet, white, 0.14),
      deep: mix(indigo, white, 0.06),
      crest: mix(peach, white, 0.35),
    },
    near: {
      ground: mix(violet, white, 0.44),
      light: mix(mix(violet, mauve, 0.4), white, 0.52),
      mid: mix(violet, white, 0.28),
      deep: mix(indigo, white, 0.16),
      crest: mix(peach, white, 0.3),
    },
    back: {
      ground: mix(mauve, white, 0.36),
      light: mix(mix(mauve, rose, 0.5), white, 0.4),
      mid: mix(mauve, white, 0.18),
      deep: mix(mix(mauve, violet, 0.5), white, 0.2),
      crest: mix(gold, white, 0.3),
    },
    // Lit from below by a sun under them: warm undersides, cooler tops.
    cloud: mix(mix(rose, mauve, 0.3), white, 0.5),
    cloudLight: mix(mix(mauve, white, 0.5), rose, 0.2),
    cloudShade: mix(mix(rose, gold, 0.35), white, 0.12),
    hull: mix(indigo, white, 0.1),
    hullDark: mix(indigo, hex('#000000'), 0.15),
    hullEdge: mix(mix(indigo, rose, 0.3), white, 0.4),
    sail: mix(peach, white, 0.62),
    sailShade: mix(mix(rose, mauve, 0.5), white, 0.5),
    line: mix(indigo, dian.light, 0.3),
    mast: indigo,
    flag: ji.light,
    lantern: mix(gold, white, 0.3),
    spray: mix(violet, white, 0.26),
    sky: 1,
    dolphin: mix(mix(violet, mauve, 0.35), white, 0.28),
    dolphinBelly: mix(peach, white, 0.55),
    fish: mix(gold, white, 0.3),
    bird: mix(indigo, dian.light, 0.3),
    star: mix(peach, white, 0.5),
    sun: mix(gold, white, 0.12),
    sunRim: mix(rose, gold, 0.25),
    halo: mix(gold, peach, 0.5),
    glitter: mix(gold, white, 0.2),
    // Gold on the water, peach and rose above it, lilac going to the page.
    dusk: {
      colors: [
        [0, mix(gold, peach, 0.4)],
        [0.12, peach],
        [0.28, mix(rose, peach, 0.35)],
        [0.45, mix(rose, mauve, 0.55)],
        [0.62, mix(mauve, white, 0.35)],
      ],
      wash: 0.78,
      strokes: 0.7,
    },
  };

  // Blue hour: the sun gone, the last of its colour low in the sky and on the
  // far water, the lantern already lit. Pastel on black, like night.
  const periwinkle = hex('#7179c8');
  const duskDark: Palette = {
    paper: night,
    front: {
      ground: mix(night, periwinkle, 0.28),
      light: mix(night, periwinkle, 0.56),
      mid: mix(night, periwinkle, 0.4),
      deep: mix(night, indigo, 0.4),
      crest: mix(night, mix(mauve, white, 0.45), 0.74),
    },
    near: {
      ground: mix(night, periwinkle, 0.23),
      light: mix(night, mix(periwinkle, mauve, 0.4), 0.5),
      mid: mix(night, periwinkle, 0.33),
      deep: mix(night, indigo, 0.34),
      crest: mix(night, mix(mauve, white, 0.45), 0.7),
    },
    // The far water holds what is left of the sky: lilac, and rose on top.
    back: {
      ground: mix(night, mix(mauve, periwinkle, 0.4), 0.3),
      light: mix(night, mix(mauve, rose, 0.45), 0.52),
      mid: mix(night, mauve, 0.36),
      deep: mix(night, mix(mauve, indigo, 0.5), 0.26),
      crest: mix(night, mix(rose, peach, 0.4), 0.62),
    },
    // Dark against the last light, and lit from under by a sun gone down.
    cloud: mix(night, mix(indigo, violet, 0.5), 0.62),
    cloudLight: mix(night, violet, 0.62),
    cloudShade: mix(night, mix(rose, peach, 0.3), 0.66),
    hull: mix(night, periwinkle, 0.3),
    hullDark: mix(night, periwinkle, 0.17),
    hullEdge: mix(night, mix(periwinkle, white, 0.4), 0.5),
    sail: mix(night, mix(mauve, white, 0.5), 0.5),
    sailShade: mix(night, mauve, 0.34),
    line: mix(night, mix(periwinkle, white, 0.4), 0.66),
    mast: mix(night, mix(periwinkle, white, 0.4), 0.56),
    flag: mix(night, ji.dark, 0.8),
    lantern: mix(gold, white, 0.45),
    spray: mix(night, mix(rose, white, 0.3), 0.66),
    sky: 0.85,
    dolphin: mix(night, mix(periwinkle, mauve, 0.3), 0.46),
    dolphinBelly: mix(night, mix(rose, white, 0.4), 0.66),
    fish: mix(night, gold, 0.7),
    bird: mix(night, mauve, 0.6),
    star: mix(peach, white, 0.6),
    sun: gold,
    sunRim: rose,
    halo: gold,
    glitter: mix(gold, white, 0.3),
    // A thin warm line on the water, then lilac, then the blue of the hour
    // going up to the night that is coming.
    dusk: {
      colors: [
        [0, mix(night, mix(peach, rose, 0.4), 0.86)],
        [0.06, mix(night, rose, 0.74)],
        [0.18, mix(night, mix(mauve, rose, 0.3), 0.64)],
        [0.34, mix(night, mix(periwinkle, mauve, 0.3), 0.56)],
        [0.6, mix(night, violet, 0.5)],
      ],
      wash: 0.66,
      strokes: 0.7,
    },
  };
  return { light, dark, 'dusk-light': duskLight, 'dusk-dark': duskDark };
}

// --- Paper ------------------------------------------------------------------

function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rand = ReturnType<typeof random>;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const between = (r: Rand, a: number, b: number) => a + (b - a) * r();

/** Box blur, wrapping horizontally (strips tile) and clamping vertically. */
function blur(src: Float32Array, w: number, h: number, rx: number, ry: number): Float32Array {
  let out = src;
  if (rx > 0) {
    out = new Float32Array(w * h);
    const n = 2 * rx + 1;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let sum = 0;
      for (let k = -rx; k <= rx; k++) sum += src[row + (((k % w) + w) % w)];
      for (let x = 0; x < w; x++) {
        out[row + x] = sum / n;
        sum += src[row + ((x + rx + 1) % w)] - src[row + ((((x - rx) % w) + w) % w)];
      }
    }
  }
  if (ry > 0) {
    const from = out;
    out = new Float32Array(w * h);
    const n = 2 * ry + 1;
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -ry; k <= ry; k++) sum += from[Math.min(h - 1, Math.max(0, k)) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = sum / n;
        sum += from[Math.min(h - 1, y + ry + 1) * w + x] - from[Math.max(0, y - ry) * w + x];
      }
    }
  }
  return out;
}

/** Remap to a uniform distribution, so a pressure of 0.4 covers 40% of the tooth. */
function equalize(src: Float32Array): Float32Array {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of src) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const bins = 4096;
  const cdf = new Float32Array(bins);
  const scale = (bins - 1) / (hi - lo || 1);
  for (const v of src) cdf[((v - lo) * scale) | 0]++;
  for (let i = 1; i < bins; i++) cdf[i] += cdf[i - 1];
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) out[i] = cdf[((src[i] - lo) * scale) | 0] / src.length;
  return out;
}

function whiteNoise(w: number, h: number, r: Rand) {
  const a = new Float32Array(w * h);
  for (let i = 0; i < a.length; i++) a[i] = r();
  return a;
}

/**
 * The paper's height field, 0 (valley) to 1 (peak). Pixel-scale tooth, a
 * slightly coarser layer so coverage clumps as it does on real paper, and a
 * thin horizontal fibre for surfaces stroked mostly side to side.
 */
function paperTooth(w: number, h: number, seed: number, fibre: number): Float32Array {
  const r = random(seed);
  const fine = equalize(blur(whiteNoise(w, h, r), w, h, 1, 0));
  const clump = equalize(blur(blur(whiteNoise(w, h, r), w, h, 2, 2), w, h, 2, 2));
  const fibres = equalize(blur(blur(whiteNoise(w, h, r), w, h, 7, 0), w, h, 5, 0));
  const out = new Float32Array(w * h);
  const wf = 0.62 - fibre * 0.55;
  const wc = 0.38 - fibre * 0.45;
  for (let i = 0; i < out.length; i++) out[i] = fine[i] * wf + clump[i] * wc + fibres[i] * fibre;
  return equalize(out);
}

/** Broad, soft value variation: the unevenness of a hand-laid ground. */
function mottle(w: number, h: number, seed: number, rx: number, ry: number): Float32Array {
  const r = random(seed);
  return equalize(blur(blur(blur(whiteNoise(w, h, r), w, h, rx, ry), w, h, rx, ry), w, h, rx, ry));
}

/** Pigment reaches the tooth wherever pressure beats the paper's height. The
    soft band is what keeps it crayon: a hard threshold reads as static. */
const deposit = (force: number, height: number) => smooth(height - 0.2, height + 0.2, force);

// --- Canvas -----------------------------------------------------------------

class Art {
  readonly px: Float32Array;

  constructor(
    readonly w: number,
    readonly h: number,
    readonly wrap: boolean,
  ) {
    this.px = new Float32Array(w * h * 4);
  }

  /** Lay pigment over what is there. Pastel is near-opaque, so plain "over". */
  put(x: number, y: number, c: RGB, a: number) {
    if (a <= 0.003 || y < 0 || y >= this.h) return;
    if (this.wrap) x = ((x % this.w) + this.w) % this.w;
    else if (x < 0 || x >= this.w) return;
    const k = (y * this.w + x) * 4;
    const p = this.px;
    const t = 1 - a;
    p[k] = c[0] * a + p[k] * t;
    p[k + 1] = c[1] * a + p[k + 1] * t;
    p[k + 2] = c[2] * a + p[k + 2] * t;
    p[k + 3] = a + p[k + 3] * t;
  }

  /** A [1 2 1] pass each way: takes the digital edge off single-pixel grain. */
  soften() {
    const { w, h, px } = this;
    const tmp = new Float32Array(px.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const l = this.wrap ? (x - 1 + w) % w : Math.max(0, x - 1);
        const r = this.wrap ? (x + 1) % w : Math.min(w - 1, x + 1);
        for (let c = 0; c < 4; c++) {
          tmp[(y * w + x) * 4 + c] =
            0.25 * px[(y * w + l) * 4 + c] + 0.5 * px[(y * w + x) * 4 + c] + 0.25 * px[(y * w + r) * 4 + c];
        }
      }
    }
    for (let y = 0; y < h; y++) {
      const u = Math.max(0, y - 1);
      const d = Math.min(h - 1, y + 1);
      for (let x = 0; x < w; x++) {
        for (let c = 0; c < 4; c++) {
          px[(y * w + x) * 4 + c] =
            0.25 * tmp[(u * w + x) * 4 + c] + 0.5 * tmp[(y * w + x) * 4 + c] + 0.25 * tmp[(d * w + x) * 4 + c];
        }
      }
    }
  }

  /** Lossy alpha suits grainy strokes; a wide soft gradient wants 100: lossy,
      it bands into contour lines, and lossless is smaller anyway. */
  async save(file: string, quality: number, alphaQuality = 85): Promise<number> {
    const out = Buffer.alloc(this.w * this.h * 4);
    for (let i = 0; i < this.w * this.h; i++) {
      const a = this.px[i * 4 + 3];
      const inv = a > 0 ? 1 / a : 0;
      out[i * 4] = Math.round(clamp01(this.px[i * 4] * inv) * 255);
      out[i * 4 + 1] = Math.round(clamp01(this.px[i * 4 + 1] * inv) * 255);
      out[i * 4 + 2] = Math.round(clamp01(this.px[i * 4 + 2] * inv) * 255);
      out[i * 4 + 3] = Math.round(clamp01(a) * 255);
    }
    const webp = await sharp(out, { raw: { width: this.w, height: this.h, channels: 4 } })
      .webp({ quality, alphaQuality, effort: 6, smartSubsample: true })
      .toBuffer();
    await writeFile(file, webp);
    return webp.length;
  }
}

// --- Strokes ----------------------------------------------------------------

type Clip = (x: number, y: number) => number;

interface Sweep {
  /** Start, art px. */
  x: number;
  y: number;
  len: number;
  width: number;
  pressure: number;
  color: RGB;
  alpha?: number;
  /** Vertical offset of the centreline at art-px x: lets a stroke ride a wave. */
  bend?: (x: number) => number;
  tilt?: number;
  clip?: Clip;
}

/**
 * A mostly horizontal crayon stroke. The lanes make it crayon rather than
 * airbrush: each stroke carries its own streaks across its width, held along
 * its length, the way the tip's texture drags through the pigment.
 */
function sweep(art: Art, tooth: Float32Array, s: Sweep, r: Rand) {
  const lanes = new Float32Array(10);
  for (let i = 0; i < lanes.length; i++) lanes[i] = r();
  const ph1 = r() * 6.283;
  const ph2 = r() * 6.283;
  const f1 = between(r, 0.6, 1.8);
  const f2 = between(r, 2.5, 6);
  const attack = between(r, 0.03, 0.1);
  const release = between(r, 0.6, 0.88);
  const alpha = s.alpha ?? 1;
  const tilt = s.tilt ?? 0;
  const { w } = art;

  for (let i = 0; i < s.len; i++) {
    const u = i / s.len;
    const x = Math.round(s.x + i);
    const wobble = Math.sin(u * f1 * 6.283 + ph1) * 0.6 + Math.sin(u * f2 * 6.283 + ph2) * 0.3;
    const cy = s.y + tilt * i + (s.bend ? s.bend(x) : 0) + wobble * s.width * 0.08;
    const half = (s.width / 2) * (0.8 + 0.2 * Math.sin(u * f2 * 2.1 + ph1));
    const press =
      s.pressure *
      smooth(0, attack, u) *
      (1 - smooth(release, 1, u) * 0.92) *
      (0.84 + 0.16 * Math.sin(u * f1 * 11.3 + ph2));
    const y0 = Math.floor(cy - half - 1);
    const y1 = Math.ceil(cy + half + 1);
    const xi = ((x % w) + w) % w;
    for (let y = y0; y <= y1; y++) {
      if (y < 0 || y >= art.h) continue;
      const d = (y - cy) / half;
      const ad = Math.abs(d);
      if (ad >= 1.15) continue;
      const foot = 1 - smooth(0.3, 1.15, ad);
      const lane = lanes[Math.min(lanes.length - 1, ((d + 1.15) / 2.3) * lanes.length) | 0];
      const height = tooth[y * w + xi] * 0.8 + lane * 0.2;
      let a = deposit(foot * press, height) * alpha;
      if (s.clip && a > 0) a *= s.clip(x, y);
      art.put(x, y, s.color, a);
    }
  }
}

type Pt = [number, number];

interface Line {
  pts: Pt[];
  width: number | ((u: number) => number);
  pressure: number | ((u: number) => number);
  color: RGB;
  alpha?: number;
  clip?: Clip;
}

/** Evenly resampled points along a polyline, with the running parameter 0..1. */
function resample(pts: Pt[], step: number) {
  const lengths = [0];
  for (let i = 1; i < pts.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const total = lengths[lengths.length - 1] || 1;
  const out: { x: number; y: number; u: number; nx: number; ny: number }[] = [];
  let seg = 1;
  for (let s = 0; s <= total; s += step) {
    while (seg < pts.length - 1 && lengths[seg] < s) seg++;
    const [ax, ay] = pts[seg - 1];
    const [bx, by] = pts[seg];
    const span = lengths[seg] - lengths[seg - 1] || 1;
    const t = (s - lengths[seg - 1]) / span;
    const len = Math.hypot(bx - ax, by - ay) || 1;
    out.push({
      x: ax + (bx - ax) * t,
      y: ay + (by - ay) * t,
      u: s / total,
      nx: -(by - ay) / len,
      ny: (bx - ax) / len,
    });
  }
  return out;
}

/**
 * A crayon stroke along any path. Stamps a footprint at every step and keeps
 * the strongest one per pixel, so a stroke never darkens where it crosses
 * itself — a crayon does not deposit twice in one pass.
 */
function line(art: Art, tooth: Float32Array, s: Line, r: Rand) {
  const widthAt = typeof s.width === 'number' ? () => s.width as number : s.width;
  const pressureAt = typeof s.pressure === 'number' ? () => s.pressure as number : s.pressure;
  const samples = resample(s.pts, 0.5);
  let maxW = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of samples) {
    maxW = Math.max(maxW, widthAt(p.u));
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const pad = maxW / 2 + 2;
  const x0 = Math.floor(minX - pad);
  const y0 = Math.floor(minY - pad);
  const bw = Math.ceil(maxX + pad) - x0;
  const bh = Math.ceil(maxY + pad) - y0;
  const foot = new Float32Array(bw * bh);
  const across = new Float32Array(bw * bh);
  const along = new Float32Array(bw * bh);

  for (const p of samples) {
    const half = Math.max(0.6, widthAt(p.u) / 2);
    for (let y = Math.floor(p.y - half - 1); y <= Math.ceil(p.y + half + 1); y++) {
      for (let x = Math.floor(p.x - half - 1); x <= Math.ceil(p.x + half + 1); x++) {
        const dx = x - p.x;
        const dy = y - p.y;
        const dist = Math.hypot(dx, dy) / half;
        if (dist >= 1.15) continue;
        const f = 1 - smooth(0.3, 1.15, dist);
        const k = (y - y0) * bw + (x - x0);
        if (f > foot[k]) {
          foot[k] = f;
          across[k] = (dx * p.nx + dy * p.ny) / half;
          along[k] = p.u;
        }
      }
    }
  }

  const lanes = new Float32Array(8);
  for (let i = 0; i < lanes.length; i++) lanes[i] = r();
  const alpha = s.alpha ?? 1;
  const { w } = art;
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const k = y * bw + x;
      if (foot[k] <= 0) continue;
      const gx = x + x0;
      const gy = y + y0;
      if (gy < 0 || gy >= art.h) continue;
      const xi = art.wrap ? ((gx % w) + w) % w : gx;
      if (xi < 0 || xi >= w) continue;
      const lane = lanes[Math.min(lanes.length - 1, ((across[k] + 1.15) / 2.3) * lanes.length) | 0];
      const height = tooth[gy * w + xi] * 0.8 + lane * 0.2;
      let a = deposit(foot[k] * pressureAt(along[k]), height) * alpha;
      if (s.clip && a > 0) a *= s.clip(gx, gy);
      art.put(gx, gy, s.color, a);
    }
  }
}

/** A pressure curve that presses in, holds, and lifts off. */
const taper =
  (peak: number, attack = 0.08, release = 0.8) =>
  (u: number) =>
    peak * smooth(0, attack, u) * (1 - smooth(release, 1, u) * 0.85);

// --- Shapes -----------------------------------------------------------------

function bezier(p0: Pt, p1: Pt, p2: Pt, p3: Pt, n = 24): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const m = 1 - t;
    out.push([
      m * m * m * p0[0] + 3 * m * m * t * p1[0] + 3 * m * t * t * p2[0] + t * t * t * p3[0],
      m * m * m * p0[1] + 3 * m * m * t * p1[1] + 3 * m * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return out;
}

/** A hand's tremor: a slow sideways drift along the path, never a jitter. */
function tremble(pts: Pt[], amp: number, r: Rand): Pt[] {
  const f1 = between(r, 1.2, 2.6);
  const f2 = between(r, 3.5, 7);
  const p1 = r() * 6.283;
  const p2 = r() * 6.283;
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const u = i / Math.max(1, pts.length - 1);
    const off = amp * (0.65 * Math.sin(u * f1 * 6.283 + p1) + 0.35 * Math.sin(u * f2 * 6.283 + p2));
    return [p[0] - ((b[1] - a[1]) / len) * off, p[1] + ((b[0] - a[0]) / len) * off];
  });
}

/** Anti-aliased coverage of a closed polygon (4 sub-rows per pixel row). */
function polygonMask(w: number, h: number, poly: Pt[]): Float32Array {
  const mask = new Float32Array(w * h);
  const sub = 4;
  for (let y = 0; y < h; y++) {
    for (let s = 0; s < sub; s++) {
      const sy = y + (s + 0.5) / sub;
      const xs: number[] = [];
      for (let i = 0; i < poly.length; i++) {
        const [ax, ay] = poly[i];
        const [bx, by] = poly[(i + 1) % poly.length];
        if (ay <= sy !== by <= sy) xs.push(ax + ((sy - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const from = Math.max(0, xs[i]);
        const to = Math.min(w, xs[i + 1]);
        for (let x = Math.floor(from); x < Math.ceil(to); x++) {
          const cover = Math.min(to, x + 1) - Math.max(from, x);
          if (cover > 0) mask[y * w + x] += cover / sub;
        }
      }
    }
  }
  return mask;
}

/** Fill a mask with a toned, mottled ground. Opaque where the mask is. */
function ground(
  art: Art,
  mask: Float32Array,
  color: (x: number, y: number) => RGB,
  tone: Float32Array,
  depth: number,
) {
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] <= 0) continue;
    const x = i % art.w;
    const y = (i / art.w) | 0;
    const c = mix(color(x, y), [0, 0, 0], (tone[i] - 0.5) * depth);
    art.put(x, y, c, mask[i]);
  }
}

/**
 * Crayon hatching clipped to a mask. The clip edge is roughened by the tooth,
 * because a crayon never stops exactly on a line; the ragged margin is what
 * makes a filled shape read as coloured-in rather than as vector fill.
 */
function hatchFill(
  art: Art,
  tooth: Float32Array,
  mask: Float32Array,
  o: {
    angle: number;
    gap: number;
    width: number;
    pressure: number;
    color: RGB;
    alpha?: number;
    run: [number, number];
    rough?: number;
    weight?: (x: number, y: number) => number;
  },
  r: Rand,
) {
  const { w, h } = art;
  let x0 = w;
  let x1 = 0;
  let y0 = h;
  let y1 = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] > 0.01) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < x0) return;
  const dx = Math.cos(o.angle);
  const dy = Math.sin(o.angle);
  const corners: Pt[] = [
    [x0, y0],
    [x1, y0],
    [x0, y1],
    [x1, y1],
  ];
  const acrossOf = (p: Pt) => -p[0] * dy + p[1] * dx;
  const alongOf = (p: Pt) => p[0] * dx + p[1] * dy;
  const aMin = Math.min(...corners.map(acrossOf));
  const aMax = Math.max(...corners.map(acrossOf));
  const tMin = Math.min(...corners.map(alongOf)) - 4;
  const tMax = Math.max(...corners.map(alongOf)) + 4;
  const rough = o.rough ?? 0.35;
  const clip: Clip = (x, y) => {
    const xi = ((x % w) + w) % w;
    if (y < 0 || y >= h) return 0;
    const m = mask[y * w + xi];
    if (m <= 0) return 0;
    const edge = smooth(0.25, 0.75, m + (tooth[y * w + xi] - 0.5) * rough);
    return o.weight ? edge * o.weight(x, y) : edge;
  };
  for (let a = aMin; a <= aMax; a += o.gap * between(r, 0.7, 1.3)) {
    let t = tMin - r() * o.run[1] * 0.5;
    while (t < tMax) {
      const len = between(r, o.run[0], o.run[1]);
      const bow = between(r, -1, 1) * o.width * 0.4;
      const start: Pt = [t * dx - a * dy, t * dy + a * dx];
      const end: Pt = [(t + len) * dx - a * dy, (t + len) * dy + a * dx];
      const mid: Pt = [(start[0] + end[0]) / 2 - dy * bow, (start[1] + end[1]) / 2 + dx * bow];
      line(
        art,
        tooth,
        {
          pts: [start, mid, end],
          width: o.width * between(r, 0.8, 1.15),
          pressure: taper(o.pressure * between(r, 0.85, 1.1), 0.1, between(r, 0.65, 0.9)),
          color: o.color,
          alpha: o.alpha,
          clip,
        },
        r,
      );
      t += len * between(r, 0.55, 0.95);
    }
  }
}

/** Draw a closed outline in broken runs, the way a pencil goes round a shape. */
function outline(art: Art, tooth: Float32Array, shape: Pt[], width: number, press: number, color: RGB, r: Rand) {
  const closed = [...shape, shape[0]];
  let i = 0;
  while (i < closed.length - 1) {
    const n = 5 + Math.floor(r() * 16);
    const run = closed.slice(i, Math.min(closed.length, i + n + 1));
    if (run.length > 1 && r() < 0.9) {
      line(art, tooth, { pts: tremble(run, width * 0.25, r), width, pressure: taper(press, 0.12, 0.72), color, alpha: 0.9 }, r);
    }
    i += n - (r() < 0.5 ? 1 : 0);
  }
}

// --- The sea ----------------------------------------------------------------

/** One wave of a profile: its crest and the troughs either side, in art px.
    `to` may run past the tile's end; every stroke wraps. */
interface Wave {
  from: number;
  x: number;
  to: number;
  /** Crest height as a share of the tallest crest in the strip. */
  height: number;
}

/** Find the crests of a painted surface (depths, art px) and the troughs between. */
function waves(surf: Float32Array, reach: number): Wave[] {
  const w = surf.length;
  const at = (x: number) => surf[((x % w) + w) % w];
  const peaks: number[] = [];
  for (let x = 0; x < w; x++) {
    let crest = true;
    for (let d = 1; d <= reach && crest; d++) crest = at(x) < at(x - d) && at(x) <= at(x + d);
    if (crest) peaks.push(x);
  }
  const mean = surf.reduce((s, v) => s + v, 0) / w;
  const tallest = Math.max(...peaks.map((x) => mean - at(x)));
  const deepestBetween = (a: number, b: number) => {
    let best = a;
    for (let x = a; x <= b; x++) if (at(x) > at(best)) best = x;
    return best;
  };
  return peaks.map((x, i) => {
    const prev = i > 0 ? peaks[i - 1] : peaks[peaks.length - 1] - w;
    const next = i < peaks.length - 1 ? peaks[i + 1] : peaks[0] + w;
    return { from: deepestBetween(prev, x), x, to: deepestBetween(x, next), height: (mean - at(x)) / tallest };
  });
}

interface WaterSpec {
  height: number;
  mean: number;
  surface: (x: number) => number;
  seed: number;
  glints: number;
  /** Share of the crests, tallest first, that break white. */
  caps: number;
  /** How far toward the deep ink the floor of the strip goes. A row that
      darkens downward is what lets the row in front of it stand out. */
  fall: number;
  /** Weight of the lit rim along the profile. */
  rim: number;
  /** How far below the surface the white water starts, CSS px. A row seen
      against the page keeps its caps inside its own edge — white on white
      paper would only erode the silhouette; a row seen against water behind
      it wears them on top. */
  capInset: number;
}

/**
 * One body of water seen side on: a swell profile against the paper, filled
 * with crayon down to the strip's floor. Every row of sea is this, in its own
 * inks and profile.
 *
 * Built up the way the waves themselves are read: a ground that lightens
 * where a crest is thin enough for light to pass and darkens toward the floor,
 * the body laid in rows, a lit rim along the profile, and last the white
 * water, heaviest on the steep downwind faces of the tallest crests.
 */
function paintWater(ink: Water, paper: RGB, o: WaterSpec): Art {
  const R = STRIP_RES;
  const w = TILE * R;
  const h = o.height * R;
  const art = new Art(w, h, true);
  const tooth = paperTooth(w, h, o.seed, 0.18);
  const tone = mottle(w, h, o.seed + 2, 40, 6);
  const r = random(o.seed + 1);
  const surf = new Float32Array(w);
  for (let x = 0; x < w; x++) surf[x] = o.surface(x / R) * R;
  const surfAt = (x: number) => surf[((Math.round(x) % w) + w) % w];
  const top = o.mean * R;
  const swell = waves(surf, 14 * R);
  const tallest = Math.max(...Array.from(surf, (d) => top - d));

  // The profile's edge, roughened by the tooth: no stick stops on a clean line.
  const edge = (x: number, y: number, inset: number) => {
    const xi = ((x % w) + w) % w;
    return smooth(0.3, 2.5, y - surf[xi] - inset + (tooth[y * w + xi] - 0.5) * 2.2);
  };

  // Paper, then the toned ground, both opaque below the surface: the near sea
  // hides the hull under the waterline, so it cannot be see-through anywhere.
  // Inset a little, so the very edge belongs to the crayon and not to fill.
  const body = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) body[y * w + x] = edge(x, y, 1.2 * R);
  }
  ground(art, body, () => paper, tone, 0);
  ground(
    art,
    body,
    (x, y) => {
      const under = y - surf[x];
      const depth = clamp01(under / (h - top));
      // A crest is thin enough for light to come through it.
      const lit = smooth(0, tallest, top - surf[x]) * (1 - smooth(0, 9 * R, under));
      const base = mix(mix(ink.ground, ink.light, 1 - smooth(0, 0.14, depth)), ink.mid, smooth(0.3, 1, depth) * 0.7);
      return mix(mix(base, ink.deep, smooth(0.12, 1, depth) * o.fall), ink.light, lit * 0.4);
    },
    tone,
    0.1,
  );
  const below: Clip = (x, y) => edge(x, y, 0);
  const follow = (bx: number) => surfAt(bx) - top;

  // Crayon over the ground in rows. Rows near the surface ride the swell;
  // deeper ones flatten out, the way the eye stops reading form below the first
  // face. Each row alternates mid and deep sticks, with the odd light one.
  for (let row = top - 24 * R; row < h + 6; row += between(r, 2.6, 4.2)) {
    const depth = clamp01((row - top + 10 * R) / (h - top + 10 * R));
    const hold = Math.exp(-depth * 3);
    for (let x = -r() * 300; x < w; ) {
      const len = between(r, 120, 420);
      const roll = r();
      const color =
        roll < 0.14 + (1 - depth) * 0.1
          ? ink.light
          : roll < 0.58 - depth * 0.1
            ? ink.mid
            : mix(ink.mid, ink.deep, 0.35 + depth * 0.65);
      sweep(
        art,
        tooth,
        {
          x,
          y: row,
          len,
          width: between(r, 7, 12),
          pressure: between(r, 0.36, 0.6) + depth * 0.14,
          color: mix(color, ink.mid, between(r, -0.1, 0.1)),
          bend: (bx) => follow(bx) * hold,
          tilt: between(r, -0.003, 0.003),
          clip: below,
        },
        r,
      );
      x += len * between(r, 0.5, 0.85);
    }
  }

  // The profile: a light rim, brighter on the crests where the sky catches it.
  for (let x = -r() * 100; x < w; ) {
    const len = between(r, 40, 180);
    const lift = top - surfAt(x + len / 2);
    sweep(
      art,
      tooth,
      {
        x,
        y: top + between(r, 1.4, 2.4) * R,
        len,
        width: between(r, 2.6, 4.4),
        pressure: (0.4 + smooth(-2 * R, 10 * R, lift) * 0.42) * o.rim,
        color: lift > 3 * R ? ink.crest : ink.light,
        bend: follow,
        clip: below,
      },
      r,
    );
    x += len + between(r, 6, 60);
  }

  // White water. The tallest crests break: a cap riding the crest and foam
  // tumbling down the steep downwind face after it, slanted the way the face
  // falls.
  const capClip: Clip = (x, y) => edge(x, y, (o.capInset - 1.6) * R);
  const slope = (x: number) => (surfAt(x + 4) - surfAt(x - 4)) / 8;
  for (const wave of swell) {
    const strength = smooth(1 - o.caps, 1, wave.height);
    if (strength <= 0) continue;
    const back = (wave.x - wave.from) * (0.1 + 0.12 * strength);
    const ahead = (wave.to - wave.x) * (0.14 + 0.3 * strength);
    for (let k = 0; k < 2; k++) {
      const shift = k * between(r, 0.2, 0.4) * ahead;
      sweep(
        art,
        tooth,
        {
          x: wave.x - back + shift,
          y: top + (o.capInset + k * 1.4) * R,
          len: (back + ahead) * (k ? 0.75 : 1),
          width: (2.6 + 1.8 * strength) * R * (k ? 0.7 : 1),
          pressure: 0.66 + 0.26 * strength,
          color: ink.crest,
          bend: follow,
          clip: capClip,
        },
        r,
      );
    }
    const flecks = Math.round(4 + 10 * strength);
    for (let k = 0; k < flecks; k++) {
      const u = Math.pow(r(), 0.8);
      const x = wave.x + (wave.to - wave.x) * (0.05 + 0.6 * u);
      sweep(
        art,
        tooth,
        {
          x,
          y: surfAt(x) + (o.capInset + 1.8 + 6 * u + between(r, -0.8, 0.8)) * R,
          len: between(r, 5, 14) * (1 - u * 0.5),
          width: between(r, 1.6, 2.6) * R * (1 - u * 0.4),
          pressure: between(r, 0.6, 0.9) * (1 - u * 0.45),
          color: ink.crest,
          alpha: 0.9,
          tilt: slope(x),
          clip: below,
        },
        r,
      );
    }
  }

  // Glints: short light ticks, thinning out with depth.
  const reach = Math.min(46 * R, h - top);
  for (let i = 0; i < o.glints; i++) {
    const x = r() * w;
    const d = Math.pow(r(), 1.8) * reach;
    sweep(
      art,
      tooth,
      {
        x,
        y: surfAt(x) + 5 * R + d,
        len: between(r, 8, 26) * (1 - d / (70 * R)),
        width: between(r, 2, 3.2),
        pressure: between(r, 0.45, 0.75),
        color: ink.crest,
        alpha: 0.8,
        clip: below,
      },
      r,
    );
  }
  art.soften();
  return art;
}

const paintFront = (p: Palette, seed: number) =>
  paintWater(p.front, p.paper, {
    height: FRONT_H,
    mean: FRONT_SURFACE,
    surface: frontSurfaceAt,
    seed,
    glints: 70 * p.sky,
    caps: 0.5,
    fall: 0.75,
    rim: 1.25,
    capInset: -0.2,
  });

const paintNear = (p: Palette, seed: number) =>
  paintWater(p.near, p.paper, {
    height: NEAR_H,
    mean: SURFACE,
    surface: surfaceAt,
    seed,
    glints: 120 * p.sky,
    caps: 0.4,
    fall: 0.5,
    rim: 1,
    capInset: 2.6,
  });

const paintBack = (p: Palette, seed: number) =>
  paintWater(p.back, p.paper, {
    height: BACK_H,
    mean: BACK_HEADROOM,
    surface: backSurfaceAt,
    seed,
    glints: 60 * p.sky,
    caps: 0.25,
    fall: 0,
    rim: 0.9,
    capInset: 2,
  });

// --- Clouds -----------------------------------------------------------------

// [centre x, base y, puffs [dx, dy, radius]] in tile CSS px, base measured down
// from the strip top. Small fair-weather cumulus as in the mockup: a flat
// underside, two or three round heads, and the odd scrap trailing off.
const CLOUDS: [number, number, [number, number, number][]][] = [
  [
    300,
    92,
    [
      [-46, -8, 12],
      [-26, -15, 17],
      [-2, -22, 21],
      [22, -16, 17],
      [42, -8, 11],
    ],
  ],
  [
    392,
    98,
    [
      [-7, -3, 5],
      [3, -5, 6.5],
      [13, -3, 4.5],
    ],
  ],
  [
    1050,
    62,
    [
      [-36, -7, 10],
      [-16, -14, 15],
      [6, -17, 16],
      [27, -10, 12],
      [44, -5, 7],
    ],
  ],
  [
    1150,
    68,
    [
      [-5, -2, 4],
      [3, -3.5, 5],
    ],
  ],
  [
    1440,
    100,
    [
      [-18, -5, 8],
      [-4, -10, 11],
      [11, -7, 9],
      [22, -4, 6],
    ],
  ],
];

function paintClouds(p: Palette, seed: number): Art {
  const R = STRIP_RES;
  const w = TILE * R;
  const h = CLOUD_H * R;
  const art = new Art(w, h, true);
  const tooth = paperTooth(w, h, seed, 0.08);
  const tone = mottle(w, h, seed + 2, 10, 8);
  const lumps = mottle(w, h, seed + 3, 3, 3);
  const r = random(seed + 1);

  for (const [cx, base, puffs] of CLOUDS) {
    const mask = new Float32Array(w * h);
    const top = Math.min(...puffs.map(([, dy, rad]) => base + dy - rad));
    const y0 = Math.max(0, Math.floor((top - 4) * R));
    const y1 = Math.min(h, Math.ceil((base + 3) * R));
    for (let y = y0; y < y1; y++) {
      // A flat, slightly soft underside.
      const under = smooth((base + 1.5) * R, (base - 2.5) * R, y);
      for (const [dx, dy, rad] of puffs) {
        const px = (cx + dx) * R;
        const py = (base + dy) * R;
        const rr = rad * R;
        for (let x = Math.floor(px - rr - 6); x <= px + rr + 6; x++) {
          const k = y * w + (((x % w) + w) % w);
          const d = Math.hypot(x - px, y - py) + (lumps[k] - 0.5) * 2.4 * R;
          const cover = smooth(rr + 1.2 * R, rr - 1.2 * R, d) * under;
          if (cover > mask[k]) mask[k] = cover;
        }
      }
    }
    const tall = (base - top) * R;
    const shadeAt = (y: number) => smooth(base * R - tall * 0.75, base * R, y);
    ground(art, mask.map((m) => m * 0.85 * p.sky), (_x, y) => mix(p.cloud, p.cloudShade, shadeAt(y) * 0.5), tone, 0.04);
    hatchFill(
      art,
      tooth,
      mask,
      {
        angle: -0.5,
        gap: 3.6,
        width: 7,
        pressure: 0.5 * p.sky,
        color: p.cloudLight,
        run: [16, 50],
        rough: 0.7,
        weight: (_x, y) => 1 - shadeAt(y) * 0.9,
      },
      r,
    );
    hatchFill(
      art,
      tooth,
      mask,
      {
        angle: -0.2,
        gap: 4,
        width: 6.5,
        pressure: 0.5 * p.sky,
        color: p.cloudShade,
        run: [16, 50],
        rough: 0.7,
        weight: (_x, y) => shadeAt(y),
      },
      r,
    );
  }
  art.soften();
  return art;
}

// --- The boat ---------------------------------------------------------------

function paintBoat(p: Palette, seed: number, lit: boolean): Art {
  const R = SPRITE_RES;
  const w = (BOAT_BOX.right - BOAT_BOX.left) * R;
  const h = (BOAT_BOX.top - BOAT_BOX.bottom) * R;
  const art = new Art(w, h, false);
  const tooth = paperTooth(w, h, seed, 0);
  const tone = mottle(w, h, seed + 2, 10, 10);
  const r = random(seed + 1);
  // Boat coordinates (y up, origin on the waterline) to art pixels.
  const at = ([x, y]: Pt): Pt => [(x - BOAT_BOX.left) * R, (BOAT_BOX.top - y) * R];
  const path = (pts: Pt[]) => tremble(pts.map(at), 0.35 * R, r);
  const [lx, ly] = at([LANTERN.x, LANTERN.y]);
  // Night: the lantern lights the cloth nearest to it, and nothing else.
  const glow = (x: number, y: number) => Math.exp(-((Math.hypot(x - lx, y - ly) / (30 * R)) ** 2));

  const main = path([
    ...bezier([-1, 20.5], [-12, 20], [-24, 19.5], [-33, 20.5], 12),
    ...bezier([-33, 20.5], [-30, 52], [-17, 84], [-1, 101], 24),
  ]);
  const jib = path([
    ...bezier([5, 95], [15, 70], [27, 42], [37, 20.5], 20),
    ...bezier([37, 20.5], [28, 21], [17, 21.2], [7, 21.5], 10),
    ...bezier([7, 21.5], [10, 44], [9, 72], [5, 95], 20),
  ]);
  const mastX = at([2, 0])[0];
  const footY = at([0, 21])[1];

  // Sails first, so the mast and hull draw over their feet. Each is opaque —
  // the horizon must not show through the cloth.
  for (const [shape, angle] of [
    [main, -1.2],
    [jib, -1.75],
  ] as [Pt[], number][]) {
    const mask = polygonMask(w, h, shape);
    ground(art, mask, () => p.paper, tone, 0);
    ground(art, mask, (x, y) => mix(p.sail, p.sailShade, clamp01(1 - Math.abs(x - mastX) / (22 * R)) * 0.35 + smooth(footY - 24 * R, footY, y) * 0.25), tone, 0.06);
    hatchFill(
      art,
      tooth,
      mask,
      {
        angle: angle + 0.2,
        gap: 4.4,
        width: 6,
        pressure: 0.5,
        color: p.sailShade,
        run: [30, 90],
        rough: 0.4,
        weight: (x, y) => clamp01(1 - Math.abs(x - mastX) / (16 * R)) * 0.9 + smooth(footY - 26 * R, footY, y) * 0.55,
      },
      r,
    );
    hatchFill(art, tooth, mask, { angle, gap: 5.5, width: 6, pressure: 0.42, color: p.sail, run: [40, 110], rough: 0.4 }, r);
    if (lit) {
      hatchFill(
        art,
        tooth,
        mask,
        { angle: angle - 0.3, gap: 3.6, width: 6, pressure: 0.8, color: mix(p.sail, p.lantern, 0.5), run: [30, 90], weight: glow },
        r,
      );
    }
    outline(art, tooth, shape, 1.25 * R, 0.62, p.line, r);
  }

  // Mast, boom, forestay.
  line(art, tooth, { pts: path([[2, 14], [1.6, 60], [1.2, 107]]), width: 1.7 * R, pressure: taper(0.95, 0.03, 0.92), color: p.mast }, r);
  line(art, tooth, { pts: path([[1, 20.5], [-34, 21]]), width: 1.3 * R, pressure: taper(0.85, 0.05, 0.85), color: p.mast }, r);
  line(art, tooth, { pts: path([[1.4, 104], [38.5, 18]]), width: 0.6 * R, pressure: taper(0.5, 0.05, 0.9), color: p.line, alpha: 0.6 }, r);

  // Hull: a crescent with a raised bow. Drawn well below the waterline — the
  // near sea hides the surplus, and the boat's pitch needs it.
  const sheer = bezier([-39, 15], [-18, 11], [16, 12], [45, 19], 24);
  const hull = path([
    ...sheer,
    ...bezier([45, 19], [36, 2], [22, -16], [2, -20], 20),
    ...bezier([2, -20], [-20, -20], [-34, -4], [-39, 15], 20),
  ]);
  const hullMask = polygonMask(w, h, hull);
  const [, deck] = at([0, 13]);
  ground(art, hullMask, () => p.paper, tone, 0);
  ground(art, hullMask, (_x, y) => mix(p.hull, p.hullDark, smooth(deck, deck + 18 * R, y) * 0.8), tone, 0.14);
  hatchFill(art, tooth, hullMask, { angle: -0.06, gap: 4.4, width: 6, pressure: 0.42, color: p.hullEdge, run: [30, 100], rough: 0.3, weight: (_x, y) => 1 - smooth(deck - 2 * R, deck + 8 * R, y) * 0.8 }, r);
  hatchFill(art, tooth, hullMask, { angle: 0.05, gap: 4.8, width: 6, pressure: 0.46, color: p.hullDark, run: [30, 100], rough: 0.3, weight: (_x, y) => smooth(deck + 2 * R, deck + 14 * R, y) }, r);
  line(art, tooth, { pts: path(sheer), width: 1.6 * R, pressure: taper(0.8, 0.05, 0.9), color: p.hullEdge }, r);
  line(art, tooth, { pts: path(bezier([-36, 8.5], [-14, 5], [16, 6], [40, 12], 30)), width: 0.8 * R, pressure: taper(0.5, 0.1, 0.8), color: p.hullEdge, alpha: 0.7 }, r);

  // Stern lantern on a crook. By day an unlit object; at night the component
  // lays a glow over the same spot.
  line(art, tooth, { pts: path([[-35, 13], [-36, 26], [-37.5, 33.5], [-41, 34]]), width: 1.1 * R, pressure: taper(0.9, 0.05, 0.95), color: p.mast }, r);
  const box = [
    [-42.9, 30.4],
    [-39.1, 30.4],
    [-38.7, 25.2],
    [-43.3, 25.2],
  ].map((q) => at(q as Pt));
  const boxMask = polygonMask(w, h, box);
  ground(art, boxMask, () => (lit ? p.lantern : p.sail), tone, 0);
  line(art, tooth, { pts: [...box, box[0]], width: 0.8 * R, pressure: 0.85, color: p.mast }, r);
  line(art, tooth, { pts: path([[-43.8, 31], [-41, 32.4], [-38.2, 31]]), width: 1 * R, pressure: 0.9, color: p.mast }, r);
  line(art, tooth, { pts: path([[-41, 32.4], [-41, 34]]), width: 0.7 * R, pressure: 0.8, color: p.mast }, r);
  art.soften();
  return art;
}

function paintFlag(p: Palette, seed: number): Art {
  const R = SPRITE_RES;
  const w = 18 * R;
  const h = 10 * R;
  const art = new Art(w, h, false);
  const tooth = paperTooth(w, h, seed, 0);
  const tone = mottle(w, h, seed + 2, 4, 4);
  const r = random(seed + 1);
  const shape: Pt[] = [
    ...bezier([0.5, 1], [5, 0.2], [10, 3], [17, 3.8], 12),
    ...bezier([17, 3.8], [11, 5.4], [6, 7.8], [0.5, 8.6], 12),
  ].map(([x, y]) => [x * R, y * R]);
  const mask = polygonMask(w, h, shape);
  ground(art, mask, () => p.flag, tone, 0.2);
  hatchFill(art, tooth, mask, { angle: 0.2, gap: 2.6, width: 4, pressure: 0.5, color: mix(p.flag, p.paper, 0.25), run: [10, 30], rough: 0.3 }, r);
  art.soften();
  return art;
}

// --- Foam and glint sprites -------------------------------------------------

function paintFoam(p: Palette, seed: number): Art {
  const R = STRIP_RES;
  const w = FOAM_W * R;
  const cell = FOAM_H * R;
  const art = new Art(w, cell * FOAM_VARIANTS, false);
  const tooth = paperTooth(w, cell * FOAM_VARIANTS, seed, 0.3);
  const r = random(seed + 1);
  for (let v = 0; v < FOAM_VARIANTS; v++) {
    const mid = v * cell + cell / 2;
    // The body: a few overlapping strokes, full and wide where the water leaves
    // the stern (right), thinning and breaking up as it spreads astern.
    for (let k = 0; k < 3; k++) {
      const from = w * between(r, 0.08, 0.4);
      const dy = between(r, -1.6, 1.6) * R;
      const pts: Pt[] = [];
      for (let x = from; x <= w - 3; x += 6) {
        const u = x / w;
        pts.push([x, mid + dy * (1.3 - u) + Math.sin(u * 9 + k * 2.1) * 0.8]);
      }
      line(
        art,
        tooth,
        {
          pts,
          width: (u) => (1.6 + 2.6 * Math.sin(Math.PI * Math.min(1, u * 1.15))) * R,
          pressure: (u) => 0.82 * smooth(0, 0.6, u) * (1 - smooth(0.82, 1, u)),
          color: p.near.crest,
        },
        r,
      );
    }
    // Loose flecks trailing off, sparser the further astern.
    for (let k = 0; k < 14; k++) {
      const u = Math.pow(r(), 0.7);
      const len = between(r, 4, 14) * R * (0.4 + u);
      sweep(
        art,
        tooth,
        {
          x: u * (w - len),
          y: mid + between(r, -3.2, 3.2) * R * (1.2 - u),
          len,
          width: between(r, 2, 3.4) * R * (0.5 + u * 0.5),
          pressure: between(r, 0.55, 0.9),
          color: p.near.crest,
        },
        r,
      );
    }
  }
  art.soften();
  return art;
}

function paintGlint(p: Palette, seed: number): Art {
  const R = STRIP_RES;
  const w = 28 * R;
  const h = 44 * R;
  const art = new Art(w, h, false);
  const tooth = paperTooth(w, h, seed, 0.3);
  const r = random(seed + 1);
  // The lantern's reflection: broken bars that shorten and thin with depth.
  for (let k = 0; k < 7; k++) {
    const u = k / 6;
    const len = (22 - u * 14) * R * between(r, 0.8, 1.1);
    sweep(
      art,
      tooth,
      {
        x: w / 2 - len / 2 + between(r, -2, 2) * R,
        y: (3 + Math.pow(u, 1.2) * 38) * R,
        len,
        width: (3.2 - u * 1.6) * R,
        pressure: 1 - u * 0.45,
        color: p.lantern,
      },
      r,
    );
  }
  art.soften();
  return art;
}

// The bow wave sprite, CSS px: the stem meets the water at (x, y) from the
// sprite's top-left.
const BOW_SPRITE = { width: 30, height: 20, x: 5, y: 12 };

/** Water shouldered up the stem and thrown forward off it. */
function paintSpray(p: Palette, seed: number): Art {
  const R = STRIP_RES;
  const w = BOW_SPRITE.width * R;
  const h = BOW_SPRITE.height * R;
  const art = new Art(w, h, false);
  const tooth = paperTooth(w, h, seed, 0.2);
  const r = random(seed + 1);
  const cx = BOW_SPRITE.x * R;
  const cy = BOW_SPRITE.y * R;
  const crest = p.near.crest;
  // The wave itself: climbing the stem, rolling over, running out ahead.
  for (let k = 0; k < 3; k++) {
    line(
      art,
      tooth,
      {
        pts: tremble(
          bezier(
            [cx - 1 * R, cy + (1 + k) * R],
            [cx + 2 * R, cy - (5 - k) * R],
            [cx + 9 * R, cy - (3 - k) * R],
            [cx + (16 + 4 * k) * R, cy + (1 + k * 0.6) * R],
            24,
          ),
          0.3 * R,
          r,
        ),
        width: (u) => (1.2 + 2.2 * Math.sin(Math.PI * u)) * R,
        pressure: (u) => (0.9 - k * 0.15) * smooth(0, 0.15, u) * (1 - smooth(0.7, 1, u)),
        color: crest,
      },
      r,
    );
  }
  // Spray, thrown forward and up.
  for (let k = 0; k < 12; k++) {
    const u = r();
    sweep(
      art,
      tooth,
      {
        x: cx + (2 + u * 18) * R,
        y: cy - (2.5 + Math.sin(u * Math.PI) * 6 + between(r, -1.2, 1.2)) * R,
        len: between(r, 2.5, 6) * R * (1 - u * 0.5),
        width: between(r, 1.6, 2.6) * R,
        pressure: between(r, 0.6, 0.9),
        color: p.spray,
        alpha: 0.9,
        tilt: between(r, -0.3, 0.1),
      },
      r,
    );
  }
  // Water churned under the surface, fading with depth.
  for (let k = 0; k < 4; k++) {
    sweep(
      art,
      tooth,
      {
        x: cx - 1 * R,
        y: cy + (3 + 1.6 * k) * R,
        len: (15 - 3 * k) * R,
        width: 3 * R,
        pressure: 0.55 - k * 0.1,
        color: crest,
        alpha: 0.6,
      },
      r,
    );
  }
  art.soften();
  return art;
}

const DROP = 9;
const DROP_VARIANTS = 4;

/** Loose droplets for the splash a touch makes: dabs of the crest colour. */
function paintDrops(p: Palette, seed: number): Art {
  const R = STRIP_RES;
  const cell = DROP * R;
  const art = new Art(cell, cell * DROP_VARIANTS, false);
  const tooth = paperTooth(cell, cell * DROP_VARIANTS, seed, 0);
  const r = random(seed + 1);
  for (let v = 0; v < DROP_VARIANTS; v++) {
    const dabs = v < 2 ? 1 : 2;
    for (let k = 0; k < dabs; k++) {
      const len = between(r, 3, 4.6) * R;
      sweep(
        art,
        tooth,
        {
          x: cell / 2 - len / 2 + between(r, -1, 1) * R * k,
          y: v * cell + cell / 2 + between(r, -1.2, 1.2) * R * k,
          len,
          width: between(r, 2.8, 3.6) * R * (k ? 0.7 : 1),
          pressure: 0.95,
          color: p.spray,
          tilt: between(r, -0.4, 0.4),
        },
        r,
      );
    }
  }
  art.soften();
  return art;
}

// --- Creatures ----------------------------------------------------------------
// What a touch can bring up out of the water or down out of the sky. Each is
// a sprite in CSS px, drawn in the same crayon as the boat; the script flies
// them.

const DOLPHIN = { width: 70, height: 32 };
const FISH = { width: 18, height: 9 };
const GULL = { width: 32, height: 14, frames: 2 };
const STAR = { width: 14, height: 14 };
const SUN = { width: 150, height: 150 };
/** From the far swell's surface (102 art px up) to the front row's (44). */
const GLITTER = { width: 120, height: 58 };

/** A sprite canvas, and a mapper from sprite CSS px to its pixels. */
function sprite(box: { width: number; height: number }, rows = 1, seed = 0) {
  const R = SPRITE_RES;
  const w = box.width * R;
  const h = box.height * R * rows;
  return {
    art: new Art(w, h, false),
    tooth: paperTooth(w, h, seed, 0),
    tone: mottle(w, h, seed + 2, 8, 6),
    r: random(seed + 1),
    at: (pts: Pt[], row = 0): Pt[] => pts.map(([x, y]) => [x * R, (y + row * box.height) * R]),
  };
}

/** A bottlenose, side on, facing right, as it clears the water. */
function paintDolphin(p: Palette, seed: number): Art {
  const R = SPRITE_RES;
  const { art, tooth, tone, r, at } = sprite(DOLPHIN, 1, seed);
  const shape = tremble(
    at([
      ...bezier([68, 19], [64, 17.6], [61, 17], [58, 13.5], 10),
      ...bezier([58, 13.5], [55, 9], [46, 7.2], [39, 7.6], 14),
      ...bezier([39, 7.6], [36, 4], [33, 1.5], [29.5, 0.8], 10),
      ...bezier([29.5, 0.8], [30.5, 4], [30, 6.5], [28, 9.5], 8),
      ...bezier([28, 9.5], [22, 10.5], [15, 12.5], [10, 15.5], 12),
      ...bezier([10, 15.5], [7, 13], [4, 10.5], [1.5, 9.5], 8),
      ...bezier([1.5, 9.5], [3, 13], [4, 15.5], [5, 17], 6),
      ...bezier([5, 17], [4, 19], [3, 21.5], [1.5, 24.5], 6),
      ...bezier([1.5, 24.5], [5, 23], [8, 20.5], [10.5, 18.5], 8),
      ...bezier([10.5, 18.5], [18, 20.5], [28, 23], [40, 23], 14),
      ...bezier([40, 23], [39, 26], [37, 28.5], [35, 30.5], 6),
      ...bezier([35, 30.5], [38.5, 28.5], [42, 25], [46, 22.4], 6),
      ...bezier([46, 22.4], [54, 22], [62, 21], [68, 19], 12),
    ]),
    0.25 * R,
    r,
  );
  const mask = polygonMask(art.w, art.h, shape);
  // Dark back, pale belly, the line between them running along the flank.
  const belly = (x: number, y: number) => smooth(15.5 * R, 21 * R, y + (x / R - 40) * 0.08 * R);
  ground(art, mask, () => p.paper, tone, 0);
  ground(art, mask, (x, y) => mix(p.dolphin, p.dolphinBelly, belly(x, y)), tone, 0.12);
  hatchFill(art, tooth, mask, { angle: -0.12, gap: 3.4, width: 5, pressure: 0.5, color: mix(p.dolphin, p.line, 0.35), run: [20, 60], rough: 0.4, weight: (x, y) => 1 - belly(x, y) }, r);
  hatchFill(art, tooth, mask, { angle: 0.08, gap: 3.8, width: 5, pressure: 0.46, color: p.dolphinBelly, run: [16, 50], rough: 0.4, weight: belly }, r);
  // Wet light along the back.
  line(art, tooth, { pts: tremble(at(bezier([56, 12.5], [50, 8.8], [44, 8.4], [40, 8.8], 16)), 0.2 * R, r), width: 1.3 * R, pressure: taper(0.6, 0.1, 0.7), color: p.dolphinBelly, alpha: 0.8 }, r);
  outline(art, tooth, shape, 0.9 * R, 0.6, p.line, r);
  // Mouth and eye.
  line(art, tooth, { pts: at([[66.5, 19.4], [61, 19.6], [57.5, 18.6]]), width: 0.6 * R, pressure: taper(0.7, 0.1, 0.8), color: p.line }, r);
  line(art, tooth, { pts: at([[56.6, 15.6], [57.4, 15.4]]), width: 1.5 * R, pressure: 1, color: p.line }, r);
  art.soften();
  return art;
}

/** A small fish, facing right, the kind that jumps in a shoal. */
function paintFish(p: Palette, seed: number): Art {
  const R = SPRITE_RES;
  const { art, tooth, tone, r, at } = sprite(FISH, 1, seed);
  const shape = at([
    ...bezier([17, 4.6], [14, 1.6], [9, 1.6], [5.5, 4], 10),
    ...bezier([5.5, 4], [4, 2.5], [2.5, 1.4], [0.8, 1], 4),
    ...bezier([0.8, 1], [1.8, 3], [1.8, 5.8], [0.8, 8], 4),
    ...bezier([0.8, 8], [2.5, 7.4], [4, 6.4], [5.5, 5.2], 4),
    ...bezier([5.5, 5.2], [9, 7.8], [14, 7.6], [17, 4.6], 10),
  ]);
  const mask = polygonMask(art.w, art.h, shape);
  ground(art, mask, () => p.paper, tone, 0);
  ground(art, mask, (_x, y) => mix(p.fish, p.dolphinBelly, smooth(3.8 * R, 6.5 * R, y) * 0.6), tone, 0.1);
  hatchFill(art, tooth, mask, { angle: -0.1, gap: 2.4, width: 3.4, pressure: 0.5, color: mix(p.fish, p.line, 0.25), run: [8, 24], rough: 0.4, weight: (_x, y) => 1 - smooth(3 * R, 5 * R, y) }, r);
  outline(art, tooth, shape, 0.55 * R, 0.55, p.line, r);
  line(art, tooth, { pts: at([[13.6, 3.7], [14.1, 3.6]]), width: 1 * R, pressure: 1, color: p.line }, r);
  art.soften();
  return art;
}

/** A gull, two frames of one wingbeat: up, then down. */
function paintGull(p: Palette, seed: number): Art {
  const R = SPRITE_RES;
  const { art, tooth, r, at } = sprite(GULL, GULL.frames, seed);
  const wings: [Pt, Pt, Pt, Pt][][] = [
    [
      [[1, 2.5], [5, 3], [10, 5], [15.2, 9.2]],
      [[15.2, 9.2], [19, 5.5], [25, 3.5], [31, 3]],
    ],
    [
      [[1.5, 10.5], [5, 7.5], [10, 7], [15.2, 8.6]],
      [[15.2, 8.6], [20, 7], [26, 7.6], [30.5, 11]],
    ],
  ];
  wings.forEach((pair, frame) => {
    for (const [a, b, c, d] of pair) {
      line(
        art,
        tooth,
        {
          pts: tremble(at(bezier(a, b, c, d, 20), frame), 0.2 * R, r),
          width: (u) => (0.7 + 1.5 * Math.sin(Math.PI * Math.min(1, 0.25 + u * 0.75))) * R,
          pressure: taper(0.92, 0.05, 0.85),
          color: p.bird,
        },
        r,
      );
    }
    line(art, tooth, { pts: at([[14, 9.3], [16.4, 9.6]], frame), width: 2.2 * R, pressure: 0.95, color: p.bird }, r);
  });
  art.soften();
  return art;
}

/** A four-pointed star: two tapered strokes crossed, and a dab. */
function paintStar(p: Palette, seed: number): Art {
  const R = SPRITE_RES;
  const { art, tooth, r, at } = sprite(STAR, 1, seed);
  const ray = (u: number) => (0.3 + 1.9 * Math.pow(Math.sin(Math.PI * u), 3)) * R;
  line(art, tooth, { pts: at([[7, 0.6], [7.1, 7], [7, 13.4]]), width: ray, pressure: 0.95, color: p.star }, r);
  line(art, tooth, { pts: at([[0.6, 7.1], [7, 7], [13.4, 6.9]]), width: ray, pressure: 0.95, color: p.star }, r);
  line(art, tooth, { pts: at([[6.4, 7], [7.6, 7]]), width: 2.4 * R, pressure: 1, color: mix(p.star, [1, 1, 1], 0.5) }, r);
  art.soften();
  return art;
}

/** The dusk sky, from the far swell's floor to the top of the sea box
    (BlogSeaFooter.astro: the 240 px band and 120 px of sky above it). */
const SEA_BOX_H = 360;
const SKY = { width: 640, height: SEA_BOX_H - BACK_FLOOR };
/** The far swell's resting surface, from the strip's top: the sky's 0. */
const HORIZON = SKY.height - (BACK_H - BACK_HEADROOM);
/** How high the colour reaches, and the crayon along the horizon. */
const SKY_REACH = 0.62;
const SKY_STROKES = 0.16;

function skyColor(colors: [number, RGB][], t: number): RGB {
  let i = 0;
  while (i < colors.length - 2 && t > colors[i + 1][0]) i++;
  const [a, ca] = colors[i];
  const [b, cb] = colors[i + 1];
  return mix(ca, cb, clamp01((t - a) / (b - a)));
}

/**
 * The sky's colour: one even wash, heaviest on the horizon and eased out to
 * nothing well below the footer's text, so the page's own sky takes over
 * without a seam; then a few level crayon strokes along the horizon only,
 * where the light is, so it still reads as drawn.
 */
function paintSky(p: Palette, seed: number): Art {
  const R = STRIP_RES;
  const w = SKY.width * R;
  const h = SKY.height * R;
  const art = new Art(w, h, true);
  const tooth = paperTooth(w, h, seed, 0.06);
  const tone = mottle(w, h, seed + 2, 60, 6);
  const r = random(seed + 1);
  const heightAt = (y: number) => clamp01((HORIZON * R - y) / (HORIZON * R));
  const { colors, wash, strokes } = p.dusk;

  const cover = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const a = wash * (1 - smooth(0, SKY_REACH, heightAt(y)));
    for (let x = 0; x < w; x++) cover[y * w + x] = a * (0.92 + 0.16 * tone[y * w + x]);
  }
  ground(art, cover, (_x, y) => skyColor(colors, heightAt(y)), tone, 0);

  for (let y = h; y > 0; y -= between(r, 2.6, 4.2) * R) {
    const t = heightAt(y);
    const press = strokes * (1 - smooth(0, SKY_STROKES, t));
    if (press < 0.04) break;
    let x = r() * 40 * R;
    while (x < w) {
      const len = between(r, 40, 160) * R;
      // Gaps, so the rows never close into a flat fill.
      if (r() < 0.35) {
        x += len * 0.8;
        continue;
      }
      sweep(
        art,
        tooth,
        {
          x,
          y: y + between(r, -1, 1) * R,
          len,
          width: between(r, 3.5, 6) * R,
          pressure: press * between(r, 0.8, 1.1),
          color: skyColor(colors, clamp01(t + between(r, -0.03, 0.03))),
          tilt: between(r, -0.006, 0.006),
        },
        r,
      );
      x += len * between(r, 0.8, 1.1);
    }
  }
  art.soften();
  return art;
}

const SUN_R = 26;
const HALO_R = 72;

/**
 * The low sun: a crayoned disc, hotter at the heart, rimmed rose, in a haze of
 * level strokes that thin out away from it. Its centre sits on the far
 * swell, so the water hides the lower half of both.
 */
function paintSun(p: Palette, seed: number): Art {
  const R = SPRITE_RES;
  const { art, tooth, tone, r, at } = sprite(SUN, 1, seed);
  const c = (SUN.width / 2) * R;
  const glow = (x: number, y: number) => Math.pow(clamp01(1 - Math.hypot(x - c, y - c) / (HALO_R * R)), 1.7);

  const haze = new Float32Array(art.w * art.h);
  for (let i = 0; i < haze.length; i++) haze[i] = glow(i % art.w, (i / art.w) | 0) * 0.5;
  ground(art, haze, () => p.halo, tone, 0.04);
  for (let y = SUN.width / 2 - HALO_R; y < SUN.width / 2 + 4; y += between(r, 2.4, 3.6)) {
    const half = Math.sqrt(Math.max(0, HALO_R * HALO_R - (y - SUN.width / 2) ** 2));
    let x = SUN.width / 2 - half + between(r, -4, 4);
    while (x < SUN.width / 2 + half) {
      const len = between(r, 14, 44);
      sweep(
        art,
        tooth,
        {
          x: x * R,
          y: y * R,
          len: len * R,
          width: between(r, 3.5, 5.5) * R,
          pressure: 0.85,
          color: mix(p.halo, p.sun, glow(x * R + (len * R) / 2, y * R)),
          clip: (px, py) => Math.pow(glow(px, py), 0.6),
        },
        r,
      );
      x += len * between(r, 0.75, 1.15);
    }
  }

  const disc: Pt[] = [];
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2;
    disc.push([SUN.width / 2 + Math.cos(a) * SUN_R, SUN.width / 2 + Math.sin(a) * SUN_R]);
  }
  const shape = tremble(at(disc), 0.3 * R, r);
  const mask = polygonMask(art.w, art.h, shape);
  const edge = (x: number, y: number) => smooth(SUN_R * 0.45 * R, SUN_R * R, Math.hypot(x - c, y - c));
  ground(art, mask, (x, y) => mix(p.sun, p.sunRim, edge(x, y) * 0.75), tone, 0.05);
  hatchFill(art, tooth, mask, { angle: -0.4, gap: 3.4, width: 6, pressure: 0.55, color: mix(p.sun, [1, 1, 1], 0.5), run: [20, 60], rough: 0.6, weight: (x, y) => 1 - edge(x, y) }, r);
  hatchFill(art, tooth, mask, { angle: 0.3, gap: 4.2, width: 6, pressure: 0.45, color: p.sunRim, run: [20, 60], rough: 0.6, weight: edge }, r);
  art.soften();
  return art;
}

/** The sun's road on the water: broken bars from the far swell down to the
    front row, short and rose far off, long and bright near. */
function paintGlitter(p: Palette, seed: number): Art {
  const R = STRIP_RES;
  const w = GLITTER.width * R;
  const h = GLITTER.height * R;
  const art = new Art(w, h, false);
  const tooth = paperTooth(w, h, seed, 0.3);
  const r = random(seed + 1);
  const rows = 17;
  for (let k = 0; k < rows; k++) {
    const u = k / (rows - 1);
    for (let piece = 0; piece < 2 + Math.round(u * 3); piece++) {
      const len = (7 + u * 30) * R * between(r, 0.45, 1);
      sweep(
        art,
        tooth,
        {
          x: w / 2 + between(r, -0.5, 0.5) * (12 + u * 76) * R - len / 2,
          y: (2 + Math.pow(u, 1.25) * (GLITTER.height - 5)) * R,
          len,
          width: (1.4 + u * 2) * R,
          pressure: 0.62 + u * 0.36,
          color: mix(mix(p.glitter, p.sunRim, 0.35), mix(p.glitter, [1, 1, 1], 0.4), u),
        },
        r,
      );
    }
  }
  art.soften();
  return art;
}

// --- Motion -----------------------------------------------------------------

/**
 * The boat rides the swell it is drawn on. Sample the painted surface under the
 * hull as the tile drifts past, average across the hull's length (a boat does
 * not feel ripples shorter than itself), take the pitch from bow minus stern,
 * then low-pass both — a hull has mass, so it answers the wave late and soft.
 */
function ride(steps: number) {
  const heave: number[] = [];
  const pitch: number[] = [];
  for (let i = 0; i < steps; i++) {
    const x = BOAT_TILE_X + (TILE * i) / steps;
    let sum = 0;
    let weight = 0;
    for (let j = -6; j <= 6; j++) {
      const wgt = Math.cos((j / 7) * (Math.PI / 2));
      sum += surfaceAt(x + (j / 6) * HULL_HALF) * wgt;
      weight += wgt;
    }
    heave.push(sum / weight - SURFACE);
    const slope = (surfaceAt(x + HULL_HALF) - surfaceAt(x - HULL_HALF)) / (2 * HULL_HALF);
    pitch.push((Math.atan(slope) * 180) / Math.PI);
  }
  const lowpass = (series: number[], span: number) =>
    series.map((_, i) => {
      let s = 0;
      for (let k = -span; k <= span; k++) s += series[(i + k + steps) % steps];
      return s / (2 * span + 1);
    });
  const lag = Math.round(steps * (0.9 / PERIOD));
  const soft = (series: number[]) => {
    const smoothed = lowpass(lowpass(series, 2), 2);
    return smoothed.map((_, i) => smoothed[(i - lag + steps) % steps]);
  };
  const round = (v: number) => Math.round(v * 100) / 100;
  return { heave: soft(heave).map(round), pitch: soft(pitch).map((v) => round(v * 0.8)) };
}

/**
 * The bow wave follows the water at the stem and grows as the stem drives
 * into it: how far the pitching hull's stem sits below the surface there,
 * normalised over the loop, is how much water it throws.
 */
function bowWave(heave: number[], pitch: number[]) {
  const steps = heave.length;
  const lift: number[] = [];
  const drive: number[] = [];
  for (let i = 0; i < steps; i++) {
    const x = BOAT_TILE_X + BOW_X + (TILE * i) / steps;
    let sum = 0;
    for (let j = -2; j <= 2; j++) sum += surfaceAt(x + j * 3);
    const surface = sum / 5 - SURFACE;
    lift.push(surface);
    drive.push(heave[i] + BOW_X * Math.sin((pitch[i] * Math.PI) / 180) - surface);
  }
  const lo = Math.min(...drive);
  const hi = Math.max(...drive);
  const round = (v: number) => Math.round(v * 100) / 100;
  return { lift: lift.map(round), surge: drive.map((d) => round((d - lo) / (hi - lo))) };
}

function foam() {
  const r = random(7);
  const out = [];
  for (let i = 0; i < FOAM_COUNT; i++) {
    const spawn = (PERIOD * i) / FOAM_COUNT;
    const x = BOAT_TILE_X + STERN_X + (TILE * spawn) / PERIOD;
    // Foam stays on the water it was born on, so its height is fixed for life:
    // the surface under the stern at the moment it leaves the hull.
    out.push({
      bottom: Math.round((NEAR_H - surfaceAt(x) - FOAM_H * 0.62) * 100) / 100,
      delay: Math.round((spawn - PERIOD) * 1000) / 1000,
      variant: i % FOAM_VARIANTS,
      opacity: Math.round(between(r, 0.72, 1) * 100) / 100,
      spread: Math.round(between(r, 1.5, 4) * (i % 2 ? 1 : -1) * 100) / 100,
      stretch: Math.round(between(r, 1.35, 1.8) * 100) / 100,
    });
  }
  return out;
}

// --- Run --------------------------------------------------------------------

async function main() {
  const inks = palettes();
  const only = process.argv[2];
  const report: string[] = [];
  for (const [name, p] of Object.entries(inks)) {
    const dir = `public/sillage/${name}`;
    await mkdir(dir, { recursive: true });
    // The lantern is lit from dusk on; the sun is up only at dusk by day.
    const lit = name !== 'light';
    const night = name.endsWith('dark');
    const jobs: [string, () => Art, number, number?][] = [
      ['front', () => paintFront(p, 59), 80],
      ['near', () => paintNear(p, 11), 80],
      ['back', () => paintBack(p, 23), 80],
      ['clouds', () => paintClouds(p, 37), 80],
      ['boat', () => paintBoat(p, 41, lit), 88],
      ['flag', () => paintFlag(p, 43), 88],
      ['foam', () => paintFoam(p, 47), 88],
      ['spray', () => paintSpray(p, 61), 88],
      ['drops', () => paintDrops(p, 67), 88],
      ['dolphin', () => paintDolphin(p, 71), 88],
      ['fish', () => paintFish(p, 73), 88],
      night ? ['star', () => paintStar(p, 79), 88] : ['gull', () => paintGull(p, 83), 88],
    ];
    if (lit) jobs.push(['glint', () => paintGlint(p, 53), 88]);
    if (name.startsWith('dusk')) jobs.push(['sky', () => paintSky(p, 101), 74, 100]);
    if (name === 'dusk-light') jobs.push(['sun', () => paintSun(p, 89), 88], ['glitter', () => paintGlitter(p, 97), 88]);
    for (const [file, paint, quality, alphaQuality] of jobs) {
      if (only && only !== file) continue;
      const art = paint();
      const bytes = await art.save(`${dir}/${file}.webp`, quality, alphaQuality);
      report.push(`${name}/${file}.webp ${art.w}x${art.h} ${(bytes / 1024).toFixed(1)} KB`);
    }
  }

  const { heave, pitch } = ride(120);
  const tenth = (v: number) => Math.round(v * 10) / 10;
  const motion = {
    note: 'Generated by scripts/paint-sillage.ts. Edit the script, not this file.',
    tile: TILE,
    period: PERIOD,
    // The swells travel with the art so a touch can find the painted surface.
    near: { height: NEAR_H, surface: SURFACE, anchor: BOAT_TILE_X / TILE, swell: SWELL, lean: LEAN },
    front: {
      height: FRONT_H,
      surface: FRONT_SURFACE,
      period: tenth(PERIOD * FRONT_PERIOD_RATIO),
      swell: FRONT_SWELL,
      lean: FRONT_LEAN,
    },
    back: { height: BACK_H, floor: BACK_FLOOR, period: tenth(PERIOD * BACK_PERIOD_RATIO) },
    clouds: { height: CLOUD_H, floor: CLOUD_FLOOR },
    boat: {
      width: BOAT_BOX.right - BOAT_BOX.left,
      height: BOAT_BOX.top - BOAT_BOX.bottom,
      originX: -BOAT_BOX.left,
      originY: BOAT_BOX.top,
      draft: DRAFT,
      lantern: { x: LANTERN.x - BOAT_BOX.left, y: BOAT_BOX.top - LANTERN.y + 0.5 },
      flag: { x: 1.4 - BOAT_BOX.left, y: BOAT_BOX.top - 105.5, width: 18, height: 10 },
    },
    foam: { width: FOAM_W, height: FOAM_H, variants: FOAM_VARIANTS, life: FOAM_LIFE, stern: STERN_X, streaks: foam() },
    bow: { x: BOW_X, sprite: BOW_SPRITE, ...bowWave(heave, pitch) },
    drop: { size: DROP, variants: DROP_VARIANTS },
    creatures: { dolphin: DOLPHIN, fish: FISH, gull: GULL, star: STAR, sun: SUN, glitter: GLITTER },
    sky: SKY,
    ride: { heave, pitch },
  };
  await writeFile('src/features/posts/ui/sillage-motion.json', `${JSON.stringify(motion, null, 2)}\n`);
  console.log(report.join('\n'));
}

if (import.meta.main) await main();
