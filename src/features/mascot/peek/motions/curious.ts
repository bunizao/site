import { PEEK_BASE } from '../base';
import { compose } from '../compose';
import { sparse } from '../layer';
import { defineMotion } from '../model';

const LEAN_LEFT = compose(PEEK_BASE.base, sparse([
  [7, 1, -1],
  [8, 1, -1],
  [9, 1, -1],
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

const REST = PEEK_BASE.base;

const LEAN_RIGHT = compose(PEEK_BASE.base, sparse([
  [0, 1, -1],
  [1, 1, -1],
  [2, 1, -1],
  [2, 4, 1],
  [3, 4, 2],
  [7, 4, 1],
  [8, 4, 2],
  [2, 5, 1],
  [3, 5, 2],
  [7, 5, 1],
  [8, 5, 2],
]));

export const PEEK_CURIOUS_MOTION = defineMotion('peek.motion.curious', 'curious', 10, [
  LEAN_LEFT,
  REST,
  REST,
  LEAN_RIGHT,
  LEAN_RIGHT,
  REST,
  REST,
  REST,
], {
  label: 'Curious',
  summary: 'Head tilt with tracking eyes.',
  usage: 'Triggered when desktop nav links are hovered.',
  status: 'active',
  tags: ['core', 'nav', 'hover'],
  motionKind: 'loop',
  loop: true,
  order: 40,
});
