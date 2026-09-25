/* Drawn faces for people with no picture on file.

   Adapted from the `beam` variant of boring-avatars
   (https://github.com/boringdesigners/boring-avatars, MIT, (c) 2021
   boringdesigners). Two changes from the original:

   - The seed is a uint32 whose low part picks the colour pair outright:
     `seed % AVATAR_CLASSES` is the class, background = class / 4 and head =
     the (class % 4)-th of the other four colours. The original hashed both
     colours independently, so a head could land on its own background and
     vanish, and nothing could tell two faces apart without drawing them. At
     32px the colour pair is what the eye actually separates, so it is also
     what the server balances when it hands out a seed (site-api
     avatar-seed.ts), and a plain modulo on both sides keeps them in step.
   - No mask: every container that shows one already clips to a circle, and
     a per-SVG mask id is one more thing that collides when several share a
     page.

   Output is built only from numbers and palette constants, so it is safe to
   insert as markup. */

import { AVATAR_CLASSES, avatarClass, seedInClass } from '@bunizao/contracts/comments';
import { seedNumber } from '@/features/comments/identity';

/** Five colours, because AVATAR_CLASSES is fixed at 5 backgrounds x 4 heads. */
export const BEAM_PALETTE = ['#264653', '#2A9D8F', '#E9C46A', '#F4A261', '#E76F51'] as const;

const SIZE = 36;

/** Palette indices of a class's two colours. */
function classPair(cls: number): { bg: number; head: number } {
  const bg = Math.floor(cls / (BEAM_PALETTE.length - 1));
  const rank = cls % (BEAM_PALETTE.length - 1);
  return { bg, head: rank < bg ? rank : rank + 1 };
}

function classColors(cls: number): { background: string; head: string } {
  const { bg, head } = classPair(cls);
  return { background: BEAM_PALETTE[bg], head: BEAM_PALETTE[head] };
}

// The original's digit helpers: each feature reads one decimal digit of the
// number, so features vary independently of one another.
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

export function beamAvatarSvg(seed: number): string {
  const { background, head } = classColors(avatarClass(seed));
  const n = Math.floor(seed / AVATAR_CLASSES);
  const face = contrast(head);

  const rawX = unit(n, 10, 1);
  const tx = rawX < 5 ? rawX + SIZE / 9 : rawX;
  const rawY = unit(n, 10, 2);
  const ty = rawY < 5 ? rawY + SIZE / 9 : rawY;
  const rotate = unit(n, 360);
  const scale = 1 + unit(n, SIZE / 12) / 10;
  const mouthOpen = flag(n, 2);
  const circle = flag(n, 1);
  const eyeSpread = unit(n, 5);
  const mouthSpread = unit(n, 3);
  const faceRotate = unit(n, 10, 3);
  const faceX = tx > SIZE / 6 ? tx / 2 : unit(n, 8, 1);
  const faceY = ty > SIZE / 6 ? ty / 2 : unit(n, 7, 2);

  const mouth = mouthOpen
    ? `<path d="M15 ${19 + mouthSpread}c2 1 4 1 6 0" stroke="${face}" fill="none" stroke-linecap="round"/>`
    : `<path d="M13,${19 + mouthSpread} a1,0.75 0 0,0 10,0" fill="${face}"/>`;

  return `<svg viewBox="0 0 ${SIZE} ${SIZE}" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`
    + `<rect width="${SIZE}" height="${SIZE}" fill="${background}"/>`
    + `<rect width="${SIZE}" height="${SIZE}" rx="${circle ? SIZE : SIZE / 6}" fill="${head}" transform="translate(${tx} ${ty}) rotate(${rotate} ${SIZE / 2} ${SIZE / 2}) scale(${scale})"/>`
    + `<g transform="translate(${faceX} ${faceY}) rotate(${faceRotate} ${SIZE / 2} ${SIZE / 2})">`
    + mouth
    + `<rect x="${14 - eyeSpread}" y="14" width="1.5" height="2" rx="1" fill="${face}"/>`
    + `<rect x="${20 + eyeSpread}" y="14" width="1.5" height="2" rx="1" fill="${face}"/>`
    + '</g></svg>';
}

/** Faces for likes with no reader behind them, each as unlike its
    neighbours as the palette allows. The head covers most of the disc, so
    the eye reads its colour first: a candidate loses most for a head colour
    already in the stack, then for a repeated class, then for a repeated
    background. Candidates are tried from a post-seeded class in steps of 7,
    which is coprime with AVATAR_CLASSES, so ties break differently per post
    but the same way on every load. */
export function anonymousSeeds(count: number, taken: Set<number>, basis: string): number[] {
  const classes = new Set(taken);
  const heads = new Set([...taken].map((cls) => classPair(cls).head));
  const backgrounds = new Set([...taken].map((cls) => classPair(cls).bg));
  const start = seedNumber(basis);
  return Array.from({ length: count }, (_, j) => {
    let best = 0;
    let bestCost = Infinity;
    for (let k = 0; k < AVATAR_CLASSES; k++) {
      const cls = (start + (j + k) * 7) % AVATAR_CLASSES;
      const { bg, head } = classPair(cls);
      const cost = (heads.has(head) ? 4 : 0) + (classes.has(cls) ? 2 : 0) + (backgrounds.has(bg) ? 1 : 0);
      if (cost < bestCost) {
        best = cls;
        bestCost = cost;
      }
    }
    const { bg, head } = classPair(best);
    classes.add(best);
    heads.add(head);
    backgrounds.add(bg);
    return seedInClass(best, seedNumber(`${basis}:anon:${j}`));
  });
}
