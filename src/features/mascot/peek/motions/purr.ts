import { PEEK_BASE } from '../base';
import { sparse } from '../layer';
import { beat, composeFrame, defineTimelineMotion } from '../timeline';

const SQUINT_NOSE = composeFrame('squint-nose', PEEK_BASE.base, sparse([
  [2, 4, 1],
  [7, 4, 1],
  [3, 5, 2],
  [4, 5, 3],
  [5, 5, 1],
  [6, 5, 2],
]));

const SQUINT_PUFF = composeFrame('squint-puff', PEEK_BASE.base, sparse([
  [2, 4, 1],
  [7, 4, 1],
  [3, 5, 2],
  [4, 5, 3],
  [6, 5, 2],
]));

const BLINK = composeFrame('blink', PEEK_BASE.base, sparse([
  [2, 4, 1],
  [7, 4, 1],
]));

export const PEEK_PURR_MOTION = defineTimelineMotion('peek.motion.purr', 'purr', 8, [
  SQUINT_NOSE,
  SQUINT_PUFF,
  BLINK,
], [
  beat(0, 1, 'squint'),
  beat(1, 1, 'puff'),
  beat(0, 1, 'squint'),
  beat(2, 1, 'blink'),
  beat(1, 1, 'puff'),
  beat(0, 1, 'squint'),
], {
  label: 'Purr',
  summary: 'Squinting eyes and a pulsing nose.',
  usage: 'The friendly baseline for positive reactions.',
  status: 'active',
  tags: ['core', 'warm'],
  motionKind: 'loop',
  loop: true,
  order: 50,
});
