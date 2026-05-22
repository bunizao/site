import { PEEK_BASE } from '../base';
import { sparse } from '../layer';
import { beat, composeFrame, defineTimelineMotion, frame } from '../timeline';

const REST = frame('rest', PEEK_BASE.base);

const FLICK_LEFT = composeFrame('flick-left', PEEK_BASE.base, sparse([
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

const FLICK_RIGHT = composeFrame('flick-right', PEEK_BASE.base, sparse([
  [2, 4, 1],
  [3, 4, 2],
  [7, 4, 1],
  [8, 4, 2],
  [2, 5, 1],
  [3, 5, 2],
  [7, 5, 1],
  [8, 5, 2],
]));

const BLINK = composeFrame('blink', PEEK_BASE.base, sparse([
  [2, 4, 1],
  [7, 4, 1],
]));

export const PEEK_DART_MOTION = defineTimelineMotion('peek.motion.dart', 'dart', 24, [
  REST,
  FLICK_LEFT,
  FLICK_RIGHT,
  BLINK,
], [
  beat(0, 1, 'rest'),
  beat(1, 2, 'flick-left'),
  beat(0, 1, 'rest'),
  beat(2, 2, 'flick-right'),
  beat(0, 1, 'rest'),
  beat(3, 1, 'blink'),
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
