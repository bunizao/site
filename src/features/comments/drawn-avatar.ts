/* Drawn faces for people with no picture on file.

   Adapted from the `marble` variant of boring-avatars
   (https://github.com/boringdesigners/boring-avatars, MIT, (c) 2021
   boringdesigners): a base colour with two blurred shapes over it. No eyes
   or mouth -- at 28px a cartoon face reads as a smudge, and a soft wash sits
   beside real photos the way an out-of-focus one would. Changes from the
   original:

   - The seed is a uint32 whose low part picks the colours outright:
     `seed % AVATAR_CLASSES` is the class, base = class / 4 and accent = the
     (class % 4)-th of the other four colours. The eye separates two small
     discs by those two colours, so that pair is also what the server
     balances when it hands out a seed (site-api avatar-seed.ts), and a plain
     modulo on both sides keeps them in step. The rest of the seed picks the
     third colour and where the shapes sit.
   - Muted palette. The original's saturated sets shouted over a page that is
     almost all greys.
   - No SVG filter. The blur is CSS on the <svg> (.drawn-face in
     comments.css), so the markup carries no id: an id per face either
     repeats when the same face is on screen twice (invalid HTML, and the lab
     checks) or differs between the server render and hydration. The base
     rect overhangs the box so the blur has colour to pull in at the edges
     instead of fading to transparent; the host's circle clips the rest.

   Output is built only from numbers and palette constants, so it is safe to
   insert as markup. */

import { AVATAR_CLASSES, avatarClass, seedInClass } from '@bunizao/contracts/comments';
import { seedNumber } from '@/features/comments/identity';

/** Five colours, because AVATAR_CLASSES is fixed at 5 bases x 4 accents. */
export const AVATAR_PALETTE = ['#2F3A45', '#8A9BB0', '#A8B8A0', '#E4D3BD', '#C99A8B'] as const;

const SIZE = 80;

/** Palette indices of a class's two colours. */
function classPair(cls: number): { base: number; accent: number } {
  const base = Math.floor(cls / (AVATAR_PALETTE.length - 1));
  const rank = cls % (AVATAR_PALETTE.length - 1);
  return { base, accent: rank < base ? rank : rank + 1 };
}

// The original's helpers: each placement reads a different decimal digit of
// the number, so the shapes move independently of one another.
const digit = (n: number, place: number) => Math.floor((n / 10 ** place) % 10);
const unit = (n: number, range: number, place?: number) => {
  const value = n % range;
  return place !== undefined && digit(n, place) % 2 === 0 ? -value : value;
};

function placement(n: number, layer: number): string {
  const m = n * layer;
  const tx = unit(m, SIZE / 10, 1);
  const ty = unit(m, SIZE / 10, 2);
  const rotate = unit(m, 360, 1);
  const scale = 1.2 + unit(m, SIZE / 20) / 10;
  return `translate(${tx} ${ty}) rotate(${rotate} ${SIZE / 2} ${SIZE / 2}) scale(${scale})`;
}

export function drawnAvatarSvg(seed: number): string {
  const { base, accent } = classPair(avatarClass(seed));
  const n = Math.floor(seed / AVATAR_CLASSES);
  const rest = AVATAR_PALETTE.filter((_, i) => i !== base && i !== accent);
  const glaze = rest[n % rest.length];

  return `<svg class="drawn-face" viewBox="0 0 ${SIZE} ${SIZE}" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`
    + `<rect x="-${SIZE / 2}" y="-${SIZE / 2}" width="${SIZE * 2}" height="${SIZE * 2}" fill="${AVATAR_PALETTE[base]}"/>`
    + `<path d="M32.414 59.35L50.376 70.5H72.5v-71H33.728L26.5 13.381l19.057 27.08L32.414 59.35z" fill="${AVATAR_PALETTE[accent]}" transform="${placement(n, 1)}"/>`
    + `<path style="mix-blend-mode:overlay" d="M22.216 24L0 46.75l14.108 38.129L78 86l-3.081-59.276-22.378 4.005 12.972 20.186-23.35 27.395L22.215 24z" fill="${glaze}" transform="${placement(n, 2)}"/>`
    + '</svg>';
}

/** The class whose accent sits `shift` (1-4) palette steps after `base`. */
function classOf(base: number, shift: number): number {
  const colours = AVATAR_PALETTE.length;
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
    post's own hash breaks ties, so a post keeps its faces across loads. */
export function anonymousSeeds(count: number, taken: Set<number>, basis: string): number[] {
  const colours = AVATAR_PALETTE.length;
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
  return best.map((cls, j) => seedInClass(cls, seedNumber(`${basis}:anon:${j}`)));
}
