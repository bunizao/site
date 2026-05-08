import type { LogoDefinition, Grid } from './types';

// 20×14 — the lurker. Full upper body + two paws clinging to an invisible edge.
// He's peeking over something, front paws hooked on the lip.
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

// Helper — build a complete 14-row frame, validating row count and width.
const FRAME = (...rows: string[]): Grid => {
  if (rows.length !== 14) throw new Error(`peek frame needs 14 rows (got ${rows.length})`);
  for (const r of rows) {
    if (r.length !== 20) throw new Error(`peek row must be 20 chars (got ${r.length}: "${r}")`);
  }
  return G(rows);
};

// ─── Silhouette segments (rows 0-5 and 10-13 stay constant) ────────────
const HEAD_TOP: ReadonlyArray<string> = [
  '...##.........##....', // 0 ear tips
  '..####.......####...', // 1 ear bodies
  '.#####......#####...', // 2 ear bases
  '#######....#######..', // 3 head top
  '###################.', // 4 forehead
  '####################', // 5 full forehead
];

const BODY_BOTTOM: ReadonlyArray<string> = [
  '.##################.', // 10 jawline
  '..################..', // 11 neck
  '###..............###', // 12 paws reach out
  '##................##', // 13 paw tips hook edge
];

// ─── Face variations (rows 6-9) ────────────────────────────────────────
// Default eyes: two 2×2 cavities at cols 3-4 & 14-15.
const FACE_OPEN: ReadonlyArray<string> = [
  '###oo#########oo####',
  '###oo#########oo####',
  '##*################*',
  '#########**#########',
];

const FACE_HALF_BLINK: ReadonlyArray<string> = [
  '####################',
  '###oo#########oo####',
  '##*################*',
  '#########**#########',
];

const FACE_BLINK: ReadonlyArray<string> = [
  '####################',
  '####################',
  '##*################*',
  '#########**#########',
];

const FACE_SLIT: ReadonlyArray<string> = [
  '####################',
  '###oo#########oo####',
  '##*################*',
  '#########**#########',
];

const FACE_EYES_LEFT: ReadonlyArray<string> = [
  '##oo##########oo####',
  '##oo##########oo####',
  '##*################*',
  '#########**#########',
];

const FACE_EYES_RIGHT: ReadonlyArray<string> = [
  '####oo#########oo###',
  '####oo#########oo###',
  '##*################*',
  '#########**#########',
];

// Pop: wider, taller eye cavities (3 rows).
const FACE_POP: ReadonlyArray<string> = [
  '##oooo########oooo##',
  '##oooo########oooo##',
  '##oooo########oooo##',
  '#########**#########',
];

// Compose a face (4 rows) into a full 14-row frame with constant head + body.
const compose = (face: ReadonlyArray<string>): Grid =>
  FRAME(...HEAD_TOP, ...face, ...BODY_BOTTOM);

const BASE = compose(FACE_OPEN);

// ─── Animations ────────────────────────────────────────────────────────

// IDLE — slow blink. 6 frames @ 4fps (~1.5s loop).
const IDLE: Grid[] = [
  compose(FACE_OPEN),
  compose(FACE_OPEN),
  compose(FACE_OPEN),
  compose(FACE_HALF_BLINK),
  compose(FACE_BLINK),
  compose(FACE_HALF_BLINK),
];

// CURIOUS — eyes track right, then left, then centre. 8 frames @ 6fps.
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

// DART — rapid L↔R eye flicks. 8 frames @ 14fps.
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

// SLEEPY — eyes droop to slit and hold. 6 frames @ 3fps.
const SLEEPY: Grid[] = [
  compose(FACE_OPEN),
  compose(FACE_HALF_BLINK),
  compose(FACE_SLIT),
  compose(FACE_SLIT),
  compose(FACE_SLIT),
  compose(FACE_HALF_BLINK),
];

// POP — surprise: eyes balloon to 3-row cavities. 5 frames @ 10fps.
const POP: Grid[] = [
  compose(FACE_OPEN),
  compose(FACE_POP),
  compose(FACE_POP),
  compose(FACE_POP),
  compose(FACE_OPEN),
];

// HIDE — sink below an invisible edge. 5 frames @ 10fps.
// We empty top rows progressively; paws retract last.
const EMPTY = '....................';
const HIDE: Grid[] = [
  compose(FACE_OPEN),
  FRAME(
    EMPTY, EMPTY,
    '...##.........##....',
    '..####.......####...',
    '.#####......#####...',
    '#######....#######..',
    '###################.',
    '####################',
    '###oo#########oo####',
    '###oo#########oo####',
    '##*################*',
    '#########**#########',
    '.##################.',
    '..################..',
  ),
  FRAME(
    EMPTY, EMPTY, EMPTY, EMPTY,
    '...##.........##....',
    '..####.......####...',
    '.#####......#####...',
    '#######....#######..',
    '###################.',
    '####################',
    '###oo#########oo####',
    '###oo#########oo####',
    '##*################*',
    '#########**#########',
  ),
  FRAME(
    EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY,
    '...##.........##....',
    '..####.......####...',
    '.#####......#####...',
    '#######....#######..',
    '###################.',
    '####################',
  ),
  FRAME(EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY),
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
    // keep "purr" and "nap" aliases so existing callers don't break
    purr:    { name: 'purr',    fps: 8,  frames: HAPPY,   loop: true },
    nap:     { name: 'nap',     fps: 3,  frames: SLEEPY,  loop: true },
  },
};
