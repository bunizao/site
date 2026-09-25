/* Drawn faces for people with no picture on file.

   Three styles, adapted from boring-avatars
   (https://github.com/boringdesigners/boring-avatars, MIT, (c) 2021
   boringdesigners), mixed on purpose so two strangers rarely look alike:

   - beam: the cartoon face, in the muted palette.
   - marble: a blurred wash, in the muted palette.
   - mist: the same wash in pastels, nearly the page colour.

   The seed decides everything, so a face is the same wherever it is drawn:

   - `seed % AVATAR_CLASSES` is the colour class: base = class / 4 and
     accent = the (class % 4)-th of the other four colours in the style's
     palette, so the two never match. That pair is what the server balances
     when it hands out a seed (site-api avatar-seed.ts), with a plain modulo
     on both sides.
   - The next ternary digit, `floor(seed / AVATAR_CLASSES) % 3`, is the
     style. The server leaves it to chance, which spreads it evenly;
     anonymousSeeds() below sets it outright so neighbours differ.
   - Everything above that places the shapes.

   Changes from the original: muted palettes, where the original's saturated
   sets shouted over a page of greys; colours picked by class rather than
   hashed independently, so a shape never vanishes into its own background;
   and no SVG mask or filter. Either needs an id, which repeats when the same
   face is on screen twice (invalid HTML, and the lab checks) or differs
   between the server render and hydration. The circle is the host's
   overflow clip, and the marble blur is CSS on .drawn-face (comments.css);
   its base rect overhangs the box so the blur has colour to pull in at the
   rim.

   Output is built only from numbers and palette constants, so it is safe to
   insert as markup. */

import { AVATAR_CLASSES, avatarClass, seedInClass } from '@bunizao/contracts/comments';
import { seedNumber } from '@/features/comments/identity';

export const AVATAR_STYLES = ['beam', 'marble', 'mist'] as const;
export type AvatarStyle = (typeof AVATAR_STYLES)[number];

/** Five colours each, because AVATAR_CLASSES is fixed at 5 bases x 4 accents. */
export const AVATAR_PALETTES: Record<AvatarStyle, readonly string[]> = {
  beam: ['#2F3A45', '#8A9BB0', '#A8B8A0', '#E4D3BD', '#C99A8B'],
  marble: ['#2F3A45', '#8A9BB0', '#A8B8A0', '#E4D3BD', '#C99A8B'],
  // The sheet's pastels, reordered to follow the muted hues above.
  mist: ['#DCE3EA', '#DDD9EA', '#D9E3D6', '#E7DDD3', '#E9D9DE'],
};

const COLOURS = 5;

export function avatarStyle(seed: number): AvatarStyle {
  return AVATAR_STYLES[Math.floor(seed / AVATAR_CLASSES) % AVATAR_STYLES.length];
}

/** Palette indices of a class's two colours. */
function classPair(cls: number): { base: number; accent: number } {
  const base = Math.floor(cls / (COLOURS - 1));
  const rank = cls % (COLOURS - 1);
  return { base, accent: rank < base ? rank : rank + 1 };
}

// The original's helpers: each feature reads a different decimal digit of
// the number, so features vary independently of one another.
const digit = (n: number, place: number) => Math.floor((n / 10 ** place) % 10);
const flag = (n: number, place: number) => digit(n, place) % 2 === 0;
const unit = (n: number, range: number, place?: number) => {
  const value = n % range;
  return place !== undefined && digit(n, place) % 2 === 0 ? -value : value;
};

function contrast(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 >= 128 ? '#000' : '#fff';
}

function beamSvg(base: string, head: string, n: number): string {
  const size = 36;
  const face = contrast(head);
  const rawX = unit(n, 10, 1);
  const tx = rawX < 5 ? rawX + size / 9 : rawX;
  const rawY = unit(n, 10, 2);
  const ty = rawY < 5 ? rawY + size / 9 : rawY;
  const rotate = unit(n, 360);
  const scale = 1 + unit(n, size / 12) / 10;
  const eyeSpread = unit(n, 5);
  const mouthSpread = unit(n, 3);
  const faceRotate = unit(n, 10, 3);
  const faceX = tx > size / 6 ? tx / 2 : unit(n, 8, 1);
  const faceY = ty > size / 6 ? ty / 2 : unit(n, 7, 2);
  const mouth = flag(n, 2)
    ? `<path d="M15 ${19 + mouthSpread}c2 1 4 1 6 0" stroke="${face}" fill="none" stroke-linecap="round"/>`
    : `<path d="M13,${19 + mouthSpread} a1,0.75 0 0,0 10,0" fill="${face}"/>`;

  return `<svg viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`
    + `<rect width="${size}" height="${size}" fill="${base}"/>`
    + `<rect width="${size}" height="${size}" rx="${flag(n, 1) ? size : size / 6}" fill="${head}" transform="translate(${tx} ${ty}) rotate(${rotate} ${size / 2} ${size / 2}) scale(${scale})"/>`
    + `<g transform="translate(${faceX} ${faceY}) rotate(${faceRotate} ${size / 2} ${size / 2})">`
    + mouth
    + `<rect x="${14 - eyeSpread}" y="14" width="1.5" height="2" rx="1" fill="${face}"/>`
    + `<rect x="${20 + eyeSpread}" y="14" width="1.5" height="2" rx="1" fill="${face}"/>`
    + '</g></svg>';
}

function marbleSvg(base: string, accent: string, glaze: string, n: number): string {
  const size = 80;
  const placement = (layer: number) => {
    const m = n * layer;
    const tx = unit(m, size / 10, 1);
    const ty = unit(m, size / 10, 2);
    const rotate = unit(m, 360, 1);
    const scale = 1.2 + unit(m, size / 20) / 10;
    return `translate(${tx} ${ty}) rotate(${rotate} ${size / 2} ${size / 2}) scale(${scale})`;
  };

  return `<svg class="drawn-face" viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`
    + `<rect x="-${size / 2}" y="-${size / 2}" width="${size * 2}" height="${size * 2}" fill="${base}"/>`
    + `<path d="M32.414 59.35L50.376 70.5H72.5v-71H33.728L26.5 13.381l19.057 27.08L32.414 59.35z" fill="${accent}" transform="${placement(1)}"/>`
    + `<path style="mix-blend-mode:overlay" d="M22.216 24L0 46.75l14.108 38.129L78 86l-3.081-59.276-22.378 4.005 12.972 20.186-23.35 27.395L22.215 24z" fill="${glaze}" transform="${placement(2)}"/>`
    + '</svg>';
}

export function drawnAvatarSvg(seed: number): string {
  const style = avatarStyle(seed);
  const palette = AVATAR_PALETTES[style];
  const { base, accent } = classPair(avatarClass(seed));
  const n = Math.floor(seed / AVATAR_CLASSES / AVATAR_STYLES.length);
  if (style === 'beam') return beamSvg(palette[base], palette[accent], n);
  const rest = palette.filter((_, i) => i !== base && i !== accent);
  return marbleSvg(palette[base], palette[accent], rest[n % rest.length], n);
}

/** The class whose accent sits `shift` (1-4) palette steps after `base`. */
function classOf(base: number, shift: number): number {
  const colours = COLOURS;
  const accent = (base + shift) % colours;
  return base * (colours - 1) + (accent < base ? accent : accent - 1);
}

/** Faces for likes with no reader behind them, each as unlike its
    neighbours as the palette allows. Base and accent split the disc about
    evenly, so both have to differ.

    Built, not searched: five faces on consecutive bases with one fixed
    accent shift wear every base and every accent exactly once (a greedy pick
    dead-ended on a repeat in about one stack in seven). Faces past five move
    to the next shift, so twenty faces cover all twenty classes. Of the
    twenty such runs (5 starting bases x 4 first shifts), the one that
    repeats least of what the named faces in `taken` already wear wins; the
    post's own hash breaks ties, so a post keeps its faces across loads.
    Styles rotate through the run, so no two neighbours share one. */
export function anonymousSeeds(count: number, taken: Set<number>, basis: string): number[] {
  const colours = COLOURS;
  const takenBases = new Set([...taken].map((cls) => classPair(cls).base));
  const takenAccents = new Set([...taken].map((cls) => classPair(cls).accent));
  const run = (start: number, firstShift: number) => Array.from({ length: count }, (_, j) =>
    classOf((start + j) % colours, ((firstShift - 1 + Math.floor(j / colours)) % (colours - 1)) + 1));
  const cost = (classes: number[]) => classes.reduce((sum, cls) => {
    const { base, accent } = classPair(cls);
    return sum + (takenBases.has(base) ? 1 : 0) + (takenAccents.has(accent) ? 1 : 0) + (taken.has(cls) ? 2 : 0);
  }, 0);

  const hash = seedNumber(basis);
  let best: number[] = [];
  let bestCost = Infinity;
  for (let k = 0; k < AVATAR_CLASSES; k++) {
    const plan = (hash + k) % AVATAR_CLASSES;
    const classes = run(plan % colours, Math.floor(plan / colours) + 1);
    const c = cost(classes);
    if (c < bestCost) {
      best = classes;
      bestCost = c;
    }
  }
  const firstStyle = hash % AVATAR_STYLES.length;
  return best.map((cls, j) => {
    // seedInClass keeps the variety's residue mod 3 (the span of varieties is
    // a multiple of 3), so pinning it here pins the style.
    const variety = seedNumber(`${basis}:anon:${j}`);
    const style = (firstStyle + j) % AVATAR_STYLES.length;
    return seedInClass(cls, variety - (variety % AVATAR_STYLES.length) + style);
  });
}
