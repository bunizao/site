import { PEEK_BASE } from '../base';
import { sparse } from '../layer';
import { beat, composeFrame, defineTimelineMotion, frame } from '../timeline';

const LEAN_LEFT = composeFrame('lean-left', PEEK_BASE.base, sparse([
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

const REST = frame('rest', PEEK_BASE.base);

const LEAN_RIGHT = composeFrame('lean-right', PEEK_BASE.base, sparse([
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

export const PEEK_CURIOUS_MOTION = defineTimelineMotion('peek.motion.curious', 'curious', 10, [
  LEAN_LEFT,
  REST,
  LEAN_RIGHT,
], [
  beat(0, 1, 'look-left'),
  beat(1, 2, 'settle'),
  beat(2, 2, 'look-right'),
  beat(1, 3, 'settle'),
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
