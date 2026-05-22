import { PEEK_BASE } from '../base';
import { sparse } from '../layer';
import { beat, composeFrame, defineTimelineMotion, frame } from '../timeline';

const REST = frame('rest', PEEK_BASE.base);

const GRIN = composeFrame('grin', PEEK_BASE.base, sparse([
  [2, 4, 1],
  [7, 4, 1],
  [3, 5, 2],
  [4, 5, 3],
  [5, 5, 3],
  [6, 5, 2],
]));

const POP = composeFrame('pop', PEEK_BASE.base, sparse([
  [0, 0, -1],
  [9, 0, -1],
  [2, 4, 2],
  [3, 4, 2],
  [6, 4, 2],
  [7, 4, 2],
  [3, 5, 2],
  [4, 5, 3],
  [5, 5, 3],
  [6, 5, 2],
]));

export const PEEK_CHEER_MOTION = defineTimelineMotion('peek.motion.cheer', 'cheer', 12, [
  REST,
  GRIN,
  POP,
], [
  beat(0, 1, 'ready'),
  beat(1, 2, 'grin'),
  beat(2, 2, 'pop'),
  beat(1, 2, 'settle'),
  beat(0, 1, 'rest'),
], {
  label: 'Cheer',
  summary: 'Short reusable celebration beat built from three source frames.',
  usage: 'Use when a success or celebratory costume needs motion without copying frame arrays.',
  status: 'active',
  tags: ['utility', 'warm', 'celebration'],
  motionKind: 'one-shot',
  loop: false,
  previewLoop: true,
  order: 85,
});
