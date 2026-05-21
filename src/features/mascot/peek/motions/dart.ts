import { PEEK_BASE } from '../base';
import { compose } from '../compose';
import { sparse } from '../layer';
import { defineMotion } from '../model';

const REST = PEEK_BASE.base;

const FLICK_LEFT = compose(PEEK_BASE.base, sparse([
  [1, 4, 2],
  [2, 4, 1],
  [6, 4, 2],
  [7, 4, 1],
  [1, 5, 2],
  [2, 5, 1],
  [4, 5, 3],
  [5, 5, 1],
  [6, 5, 2],
  [7, 5, 1],
]));

const FLICK_RIGHT = compose(PEEK_BASE.base, sparse([
  [2, 4, 1],
  [3, 4, 2],
  [7, 4, 1],
  [8, 4, 2],
  [2, 5, 1],
  [3, 5, 2],
  [7, 5, 1],
  [8, 5, 2],
]));

const BLINK = compose(PEEK_BASE.base, sparse([
  [2, 4, 1],
  [7, 4, 1],
]));

export const PEEK_DART_MOTION = defineMotion('peek.motion.dart', 'dart', 24, [
  REST,
  FLICK_LEFT,
  FLICK_LEFT,
  REST,
  FLICK_RIGHT,
  FLICK_RIGHT,
  REST,
  BLINK,
], {
  label: 'Dart',
  summary: 'Rapid eye flick left to right.',
  usage: 'Used for navbar hover and fast-scroll reactions.',
  status: 'active',
  tags: ['core', 'nav', 'fast'],
  motionKind: 'loop',
  loop: true,
  order: 60,
});
