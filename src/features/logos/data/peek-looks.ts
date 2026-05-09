import type { Grid, PeekLookDefinition } from './types';

const P = (rows: ReadonlyArray<ReadonlyArray<number>>): Grid => rows as Grid;

const PEEK_LOOK_CONFUSED = P([
  [0,1,1,0,0,0,0,1,1,0],
  [1,1,1,0,0,0,0,1,1,1],
  [1,1,1,1,1,1,1,1,1,1],
  [1,1,1,1,1,1,1,1,1,1],
  [1,1,2,1,1,1,1,1,1,1],
  [1,1,2,1,1,3,1,2,1,1],
  [1,1,1,1,1,1,1,2,1,1],
]);

const PEEK_LOOK_WINK = P([
  [0,1,1,0,0,0,0,1,1,0],
  [1,1,1,0,0,0,0,1,1,1],
  [1,1,1,1,1,1,1,1,1,1],
  [1,1,1,1,1,1,1,1,1,1],
  [1,1,1,1,1,1,1,2,1,1],
  [1,1,2,2,1,3,1,2,1,1],
  [1,1,1,1,1,1,1,1,1,1],
]);

const PEEK_LOOK_HEART = P([
  [0,1,1,0,0,0,0,1,1,0],
  [1,1,1,0,0,0,0,1,1,1],
  [1,1,1,1,1,1,1,1,1,1],
  [1,4,1,4,1,1,1,4,1,4],
  [1,4,4,4,1,1,1,4,4,4],
  [1,1,4,1,1,3,1,1,4,1],
  [1,1,1,1,1,1,1,1,1,1],
]);

const PEEK_LOOK_SLEEPY = P([
  [0,1,1,0,0,0,0,1,1,0],
  [1,1,1,0,0,0,0,1,1,1],
  [1,1,1,1,1,1,1,1,1,1],
  [1,1,1,1,1,1,1,1,1,1],
  [1,1,1,1,1,1,1,1,1,1],
  [1,1,2,2,1,3,1,2,2,1],
  [1,1,1,1,1,1,1,1,1,1],
]);

const PEEK_LOOK_ERROR = P([
  [0,1,1,0,0,0,0,1,1,0],
  [1,1,1,0,0,0,0,1,1,1],
  [1,1,1,1,1,1,1,1,1,1],
  [1,1,1,1,1,1,1,1,1,1],
  [1,2,1,2,1,1,1,2,1,2],
  [1,1,2,1,1,3,1,1,2,1],
  [1,2,1,2,1,1,1,2,1,2],
]);

const PEEK_LOOK_STARRY = P([
  [0,1,1,0,0,0,0,1,1,0],
  [1,1,1,0,0,0,0,1,1,1],
  [1,1,1,1,1,1,1,1,1,1],
  [1,1,6,1,1,1,1,6,1,1],
  [1,6,6,6,1,1,1,6,6,6],
  [1,1,6,1,1,3,1,1,6,1],
  [1,1,1,1,1,1,1,1,1,1],
]);

const PEEK_LOOK_FOCUS = P([
  [0,1,1,0,0,0,0,1,1,0],
  [1,1,1,0,0,0,0,1,1,1],
  [1,1,1,1,1,1,1,1,1,1],
  [1,1,1,1,1,1,1,1,1,1],
  [1,1,1,1,1,1,1,1,1,1],
  [1,1,2,1,1,3,1,2,1,1],
  [1,1,1,1,1,1,1,1,1,1],
]);

const PEEK_LOOK_CRY = P([
  [0,1,1,0,0,0,0,1,1,0],
  [1,1,1,0,0,0,0,1,1,1],
  [1,1,1,1,1,1,1,1,1,1],
  [1,1,1,1,1,1,1,1,1,1],
  [1,1,2,1,1,1,1,2,1,1],
  [1,1,2,1,1,3,1,2,1,1],
  [1,1,1,8,1,1,1,1,8,1],
]);

const PEEK_LOOK_SANTA = P([
  [0,0,5,5,0,0,0,0,0,0],
  [0,0,5,5,4,4,0,0,0,0],
  [0,0,0,4,4,4,4,0,0,0],
  [0,0,4,4,4,4,4,4,0,0],
  [0,5,5,5,5,5,5,5,5,0],
  [0,1,1,0,0,0,0,1,1,0],
  [1,1,1,0,0,0,0,1,1,1],
  [1,1,1,1,1,1,1,1,1,1],
  [1,1,1,1,1,1,1,1,1,1],
  [1,1,2,1,1,1,1,2,1,1],
  [1,1,2,1,1,3,1,2,1,1],
  [1,1,1,1,1,1,1,1,1,1],
]);

const PEEK_LOOK_PARTY = P([
  [0,0,0,0,6,0,0,0,0,0],
  [0,0,0,6,6,6,0,0,0,0],
  [0,0,0,4,5,4,0,0,0,0],
  [0,0,4,4,4,4,4,0,0,0],
  [0,7,7,7,7,7,7,7,7,0],
  [0,1,1,0,0,0,0,1,1,0],
  [1,1,1,0,0,0,0,1,1,1],
  [1,1,1,1,1,1,1,1,1,1],
  [1,1,1,1,1,1,1,1,1,1],
  [1,1,2,1,1,1,1,2,1,1],
  [1,1,2,1,1,3,1,2,1,1],
  [1,1,1,1,1,1,1,1,1,1],
]);

const PEEK_LOOK_WITCH = P([
  [0,0,0,0,0,8,0,0,0,0],
  [0,0,0,0,8,8,8,0,0,0],
  [0,0,0,8,8,8,8,8,0,0],
  [0,0,8,8,8,7,8,8,8,0],
  [0,7,7,7,7,7,7,7,7,0],
  [0,1,1,0,0,0,0,1,1,0],
  [1,1,1,0,0,0,0,1,1,1],
  [1,1,1,1,1,1,1,1,1,1],
  [1,1,1,1,1,1,1,1,1,1],
  [1,1,2,1,1,1,1,2,1,1],
  [1,1,2,1,1,3,1,2,1,1],
  [1,1,1,1,1,1,1,1,1,1],
]);

const PEEK_LOOK_LANTERN = P([
  [0,0,0,0,0,0,0,0,8,0],
  [0,0,0,0,0,0,0,4,4,4],
  [0,0,0,0,0,0,0,4,6,4],
  [0,0,0,0,0,0,0,4,4,4],
  [0,0,0,0,0,0,0,0,4,0],
  [0,1,1,0,0,0,0,1,1,0],
  [1,1,1,0,0,0,0,1,1,1],
  [1,1,1,1,1,1,1,1,1,1],
  [1,1,1,1,1,1,1,1,1,1],
  [1,1,2,1,1,1,1,2,1,1],
  [1,1,2,1,1,3,1,2,1,1],
  [1,1,1,1,1,1,1,1,1,1],
]);

const PEEK_LOOK_HEADPHONES = P([
  [0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0],
  [0,0,8,8,8,8,8,8,0,0],
  [0,8,8,0,0,0,0,8,8,0],
  [8,8,0,0,0,0,0,0,8,8],
  [8,8,1,0,0,0,0,1,8,8],
  [8,8,1,0,0,0,0,1,8,8],
  [1,1,1,1,1,1,1,1,1,1],
  [1,1,1,1,1,1,1,1,1,1],
  [1,1,2,1,1,1,1,2,1,1],
  [1,1,2,1,1,3,1,2,1,1],
  [1,1,1,1,1,1,1,1,1,1],
]);

const PEEK_LOOK_CROWN = P([
  [0,0,0,0,0,0,0,0,0,0],
  [0,6,0,0,6,0,6,0,0,6],
  [0,6,6,6,6,6,6,6,6,6],
  [0,6,4,6,4,6,4,6,4,6],
  [0,6,6,6,6,6,6,6,6,6],
  [0,1,1,0,0,0,0,1,1,0],
  [1,1,1,0,0,0,0,1,1,1],
  [1,1,1,1,1,1,1,1,1,1],
  [1,1,1,1,1,1,1,1,1,1],
  [1,1,2,1,1,1,1,2,1,1],
  [1,1,2,1,1,3,1,2,1,1],
  [1,1,1,1,1,1,1,1,1,1],
]);

const PEEK_LOOK_GRADUATE = P([
  [0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,8,0,0,0,0,0],
  [0,0,0,0,8,8,0,0,0,0],
  [8,8,8,8,8,8,8,8,8,8],
  [0,0,0,8,8,8,8,0,0,0],
  [0,1,1,0,0,0,0,1,1,0],
  [1,1,1,0,0,0,0,1,1,1],
  [1,1,1,1,1,1,1,1,1,1],
  [1,1,1,1,1,1,1,1,1,1],
  [1,1,2,1,1,1,1,2,1,1],
  [1,1,2,1,1,3,1,2,1,1],
  [1,1,1,1,1,1,1,1,1,1],
]);

export const PEEK_EXPRESSION_LOOKS: ReadonlyArray<PeekLookDefinition> = [
  { kind: 'expression', label: 'confused', blurb: 'asymmetric eyes, one drooping. for /404 and lost states.', grid: PEEK_LOOK_CONFUSED },
  { kind: 'expression', label: 'wink', blurb: 'left eye closed. for easter eggs and footers.', grid: PEEK_LOOK_WINK },
  { kind: 'expression', label: 'heart', blurb: 'pixel hearts for eyes. /about, /thanks.', grid: PEEK_LOOK_HEART },
  { kind: 'expression', label: 'sleepy', blurb: 'eyes shut. deep-night reading mode.', grid: PEEK_LOOK_SLEEPY },
  { kind: 'expression', label: 'error', blurb: 'X eyes. form errors, bad input.', grid: PEEK_LOOK_ERROR },
  { kind: 'expression', label: 'starry', blurb: 'sparkle eyes. launches, success toasts.', grid: PEEK_LOOK_STARRY },
  { kind: 'expression', label: 'focus', blurb: 'one-line eyes. writing / focus mode.', grid: PEEK_LOOK_FOCUS },
  { kind: 'expression', label: 'cry', blurb: 'a single tear. empty inbox / no results.', grid: PEEK_LOOK_CRY },
];

export const PEEK_COSTUME_LOOKS: ReadonlyArray<PeekLookDefinition> = [
  { kind: 'costume', label: 'santa', blurb: 'december takeover. red+white classic.', grid: PEEK_LOOK_SANTA },
  { kind: 'costume', label: 'party', blurb: 'launch days, anniversary, birthday.', grid: PEEK_LOOK_PARTY },
  { kind: 'costume', label: 'witch', blurb: 'halloween. pointy hat with a green band.', grid: PEEK_LOOK_WITCH },
  { kind: 'costume', label: 'lantern', blurb: '春节. red lantern with a 福-gold dot.', grid: PEEK_LOOK_LANTERN },
  { kind: 'costume', label: 'headphones', blurb: 'cups over the ears. links to /listening.', grid: PEEK_LOOK_HEADPHONES },
  { kind: 'costume', label: 'crown', blurb: 'gold crown with ruby beads. paid / pro user.', grid: PEEK_LOOK_CROWN },
  { kind: 'costume', label: 'graduate', blurb: 'mortarboard with tassel. course finished.', grid: PEEK_LOOK_GRADUATE },
];
