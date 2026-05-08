import type { LogoDefinition, Grid } from './types';

// 20×14 — the lurker. Compact head with small ears + two paws gripping the ledge.
//
// Legend:
//   "." = empty / transparent
//   "#" = body (foreground)
//   "o" = eye cavity (transparent — page bg shows through)
//   "*" = accent (nose + cheek dots)
const G = (rows: string[]): Grid =>
  rows.map((r) =>
    r.split('').map((c) => (c === '#' ? 1 : c === 'o' ? 2 : c === '*' ? 3 : 0)),
  ) as Grid;

const FRAME = (...rows: string[]): Grid => {
  if (rows.length !== 14) throw new Error(`peek frame needs 14 rows (got ${rows.length})`);
  for (const r of rows) {
    if (r.length !== 20) throw new Error(`peek row must be 20 chars (got ${r.length}: "${r}")`);
  }
  return G(rows);
};

// ─── Silhouette (constant across all frames) ────────────────────────────────

// Ears at cols 6-7 and 12-13. Head widens from ear-tips to 18px wide,
// giving a rounded dome silhouette instead of a flat rectangle.
const HEAD_TOP: ReadonlyArray<string> = [
  '......##....##......', // 0  ear tips (2px)
  '.....####..####.....', // 1  ear bodies (4px)
  '....############....', // 2  head top — ears join (12px)
  '...##############...', // 3  forehead (14px)
  '..################..', // 4  (16px)
  '.##################.', // 5  full width (18px)
];

const BODY_BOTTOM: ReadonlyArray<string> = [
  '.##################.', // 10 jawline
  '..################..', // 11 neck
  '###..............###', // 12 paws reach out
  '##................##', // 13 paw tips hook edge
];

// ─── Face variations (rows 6-9) ─────────────────────────────────────────────
// Eyes: 1×2 holes at col 6 (left) and col 13 (right).
// Cheek dots at col 4 and col 15; nose dots at cols 9-10.

const FACE_OPEN: ReadonlyArray<string> = [
  '.#####o######o#####.', // eye open — top
  '.#####o######o#####.', // eye open — bottom (1×2 holes)
  '.###*####**####*###.', // cheeks (4,15) + nose (9-10)
  '.##################.', // chin
];

// Eyelid droops from the top — upper row fills in, lower remains open.
const FACE_HALF_BLINK: ReadonlyArray<string> = [
  '.##################.', // top of eye closed
  '.#####o######o#####.', // bottom still visible
  '.###*####**####*###.',
  '.##################.',
];

const FACE_BLINK: ReadonlyArray<string> = [
  '.##################.',
  '.##################.',
  '.###*####**####*###.',
  '.##################.',
];

// 1px height can't show a narrower slit — alias to blink.
const FACE_SLIT = FACE_BLINK;

// Pupils shift left (-1) or right (+1).
const FACE_EYES_LEFT: ReadonlyArray<string> = [
  '.####o######o######.', // holes at col 5, 12
  '.####o######o######.',
  '.###*####**####*###.',
  '.##################.',
];

const FACE_EYES_RIGHT: ReadonlyArray<string> = [
  '.######o######o####.', // holes at col 7, 14
  '.######o######o####.',
  '.###*####**####*###.',
  '.##################.',
];

// Surprise: holes widen to 2×2 (cols 5-6 and 12-13).
const FACE_POP: ReadonlyArray<string> = [
  '.####oo#####oo#####.',
  '.####oo#####oo#####.',
  '.###*####**####*###.',
  '.##################.',
];

// ─── Compose helper ──────────────────────────────────────────────────────────
const compose = (face: ReadonlyArray<string>): Grid =>
  FRAME(...HEAD_TOP, ...face, ...BODY_BOTTOM);

const BASE = compose(FACE_OPEN);

// ─── Animations ──────────────────────────────────────────────────────────────
const EMPTY = '....................';

// IDLE — slow blink. 6 frames @ 4fps.
const IDLE: Grid[] = [
  compose(FACE_OPEN),
  compose(FACE_OPEN),
  compose(FACE_OPEN),
  compose(FACE_HALF_BLINK),
  compose(FACE_BLINK),
  compose(FACE_HALF_BLINK),
];

// CURIOUS — eyes scan right then left. 8 frames @ 6fps.
const CURIOUS: Grid[] = [
  compose(FACE_OPEN),
  compose(FACE_EYES_RIGHT),
  compose(FACE_EYES_RIGHT),
  compose(FACE_OPEN),
  compose(FACE_EYES_LEFT),
  compose(FACE_EYES_LEFT),
  compose(FACE_OPEN),
  compose(FACE_OPEN),
];

// HAPPY — quick squint flash. 4 frames @ 8fps.
const HAPPY: Grid[] = [
  compose(FACE_OPEN),
  compose(FACE_SLIT),
  compose(FACE_SLIT),
  compose(FACE_OPEN),
];

// DART — rapid L↔R flicks. 8 frames @ 14fps.
const DART: Grid[] = [
  compose(FACE_OPEN),
  compose(FACE_EYES_RIGHT),
  compose(FACE_EYES_LEFT),
  compose(FACE_EYES_RIGHT),
  compose(FACE_EYES_LEFT),
  compose(FACE_OPEN),
  compose(FACE_EYES_RIGHT),
  compose(FACE_OPEN),
];

// SLEEPY — eyes droop and hold. 6 frames @ 3fps.
const SLEEPY: Grid[] = [
  compose(FACE_OPEN),
  compose(FACE_HALF_BLINK),
  compose(FACE_SLIT),
  compose(FACE_SLIT),
  compose(FACE_SLIT),
  compose(FACE_HALF_BLINK),
];

// POP — wide-eye surprise. 5 frames @ 10fps.
const POP: Grid[] = [
  compose(FACE_OPEN),
  compose(FACE_POP),
  compose(FACE_POP),
  compose(FACE_POP),
  compose(FACE_OPEN),
];

// HIDE — sink below ledge. 6 frames @ 10fps.
// Progressive row-emptying from top; paws retract last.
const HIDE: Grid[] = [
  compose(FACE_OPEN),
  FRAME(
    EMPTY, EMPTY,
    ...HEAD_TOP.slice(2),
    ...FACE_OPEN,
    ...BODY_BOTTOM,
  ),
  FRAME(
    EMPTY, EMPTY, EMPTY, EMPTY,
    ...HEAD_TOP.slice(4),
    ...FACE_OPEN,
    ...BODY_BOTTOM,
  ),
  FRAME(
    EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY,
    ...FACE_OPEN,
    ...BODY_BOTTOM,
  ),
  FRAME(
    EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY,
    ...BODY_BOTTOM,
  ),
  FRAME(
    EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY,
    EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY,
  ),
];

export const PEEK: LogoDefinition = {
  id: 'peek',
  name: 'peek',
  tagline: 'the lurker',
  blurb: 'clinging to the edge. always watching. never types first.',
  width: 20,
  height: 14,
  base: BASE,
  accent: 'oklch(0.62 0.13 25)',
  animations: {
    idle:    { name: 'idle',    fps: 4,  frames: IDLE,    loop: true },
    curious: { name: 'curious', fps: 6,  frames: CURIOUS, loop: true },
    happy:   { name: 'happy',   fps: 8,  frames: HAPPY,   loop: true },
    dart:    { name: 'dart',    fps: 14, frames: DART,    loop: true },
    sleepy:  { name: 'sleepy',  fps: 3,  frames: SLEEPY,  loop: true },
    pop:     { name: 'pop',     fps: 10, frames: POP,     loop: true },
    hide:    { name: 'hide',    fps: 10, frames: HIDE,    loop: true },
    purr:    { name: 'purr',    fps: 8,  frames: HAPPY,   loop: true },
    nap:     { name: 'nap',     fps: 3,  frames: SLEEPY,  loop: true },
  },
};
