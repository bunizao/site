/* Drawn faces for people with no picture on file.

   Three styles, ported from boring-avatars
   (https://github.com/boringdesigners/boring-avatars, MIT, (c) 2021
   boringdesigners) with the same geometry, mixed so two strangers rarely
   look alike:

   - beam: the cartoon face.
   - marble: a blurred wash.
   - mist: the same wash with its palette lifted halfway to white.

   Colours come from avatar-palettes.ts, the palette set boringavatars.com
   samples from. The seed decides everything, so a face is the same wherever
   it is drawn:

   - `seed % AVATAR_CLASSES` is the colour class: base = class / 4 and
     accent = the (class % 4)-th of the palette's other four colours, so the
     two never match. That class is what the server balances when it hands
     out a seed (site-api avatar-seed.ts), with a plain modulo on both sides.
   - Above it, in turn: the style (3), the palette (AVATAR_PALETTE_COUNT),
     and the number that places the shapes. The server leaves these to
     chance, which spreads them evenly; anonymousSeeds() below sets them
     outright so neighbours differ.

   The one change from the original: no SVG mask or filter. Either needs an
   id, which repeats when the same face is on screen twice (invalid HTML,
   and the lab checks) or differs between the server render and hydration.
   The circle is the host's overflow clip, and the marble blur is CSS on
   .drawn-face (comments.css); its base rect overhangs the box so the blur
   has colour to pull in at the rim.

   Output is built only from numbers and palette constants, so it is safe to
   insert as markup. */

import { AVATAR_CLASSES, MAX_AVATAR_SEED, avatarClass, seedInClass } from '@bunizao/contracts/comments';
import { AVATAR_PALETTE_COUNT, avatarPalette } from '@/features/comments/avatar-palettes';
import { seedNumber } from '@/features/comments/identity';

export const AVATAR_STYLES = ['beam', 'marble', 'mist'] as const;
export type AvatarStyle = (typeof AVATAR_STYLES)[number];

const STYLES = AVATAR_STYLES.length;
const COLOURS = 5;
/** Seeds per class that share a style and palette: the shape numbers. */
const SHAPES = Math.floor(Math.floor(MAX_AVATAR_SEED / AVATAR_CLASSES) / (STYLES * AVATAR_PALETTE_COUNT));

export interface AvatarParts {
  cls: number;
  style: AvatarStyle;
  palette: number;
  shape: number;
}

export function avatarParts(seed: number): AvatarParts {
  const rest = Math.floor(seed / AVATAR_CLASSES);
  return {
    cls: avatarClass(seed),
    style: AVATAR_STYLES[rest % STYLES],
    palette: Math.floor(rest / STYLES) % AVATAR_PALETTE_COUNT,
    shape: Math.floor(rest / STYLES / AVATAR_PALETTE_COUNT),
  };
}

/** The seed that draws exactly these parts; `shape` wraps into range. */
export function seedOfParts({ cls, style, palette, shape }: AvatarParts): number {
  const rest = (Math.abs(Math.trunc(shape)) % SHAPES) * STYLES * AVATAR_PALETTE_COUNT
    + (palette % AVATAR_PALETTE_COUNT) * STYLES
    + AVATAR_STYLES.indexOf(style);
  return seedInClass(cls, rest);
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

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function contrast(hex: string): string {
  const [r, g, b] = channels(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 >= 128 ? '#000000' : '#ffffff';
}

function lift(hex: string): string {
  return `#${channels(hex).map((c) => Math.round(c + (255 - c) / 2).toString(16).padStart(2, '0')).join('')}`;
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
  // The original numbers its three layers 0-2 and places layer i with n * (i + 1).
  const placement = (layer: number) => {
    const m = n * (layer + 1);
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
  const { cls, style, palette: index, shape } = avatarParts(seed);
  const palette = style === 'mist' ? avatarPalette(index).map(lift) : avatarPalette(index);
  const { base, accent } = classPair(cls);
  if (style === 'beam') return beamSvg(palette[base], palette[accent], shape);
  const rest = palette.filter((_, i) => i !== base && i !== accent);
  return marbleSvg(palette[base], palette[accent], rest[shape % rest.length], shape);
}

/** Seeds for faces with no seed of their own (likes with no reader behind
    them), drawn side by side in a stack. Each wears its own palette, none
    of the palettes or classes the named faces in `taken` wear, and a style
    different from its neighbours. The post's hash picks the order, so a
    post keeps its faces across loads and two posts differ. */
export function anonymousSeeds(count: number, taken: readonly number[], basis: string): number[] {
  const takenParts = taken.map(avatarParts);
  const takenClasses = new Set(takenParts.map((parts) => parts.cls));
  const takenPalettes = new Set(takenParts.map((parts) => parts.palette));
  const hash = seedNumber(basis);

  // 7 is coprime to 20, so the walk visits every class once; free ones first.
  const walk = Array.from({ length: AVATAR_CLASSES }, (_, k) => (hash + 7 * k) % AVATAR_CLASSES);
  const classes = [...walk.filter((cls) => !takenClasses.has(cls)), ...walk.filter((cls) => takenClasses.has(cls))];

  const palettes: number[] = [];
  for (let k = 0; palettes.length < count && k < AVATAR_PALETTE_COUNT; k++) {
    const palette = (hash + k) % AVATAR_PALETTE_COUNT;
    if (!takenPalettes.has(palette)) palettes.push(palette);
  }

  return Array.from({ length: count }, (_, j) => seedOfParts({
    cls: classes[j % AVATAR_CLASSES],
    style: AVATAR_STYLES[(hash + j) % STYLES],
    palette: palettes[j % palettes.length],
    shape: seedNumber(`${basis}:anon:${j}`),
  }));
}
