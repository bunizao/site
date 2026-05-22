import { PEEK_BASE } from '../base';
import { sparse } from '../layer';
import { beat, composeFrame, defineTimelineMotion } from '../timeline';

const NOSE = composeFrame('nose', PEEK_BASE.base, sparse([
  [2, 4, 1],
  [7, 4, 1],
  [2, 5, 1],
  [7, 5, 1],
]));

const REST = composeFrame('rest', PEEK_BASE.base, sparse([
  [2, 4, 1],
  [7, 4, 1],
  [2, 5, 1],
  [5, 5, 1],
  [7, 5, 1],
]));

export const PEEK_NAP_MOTION = defineTimelineMotion('peek.motion.nap', 'nap', 3, [
  NOSE,
  REST,
], [
  beat(0, 1, 'nose'),
  beat(1, 1, 'rest'),
  beat(0, 1, 'nose'),
  beat(1, 1, 'rest'),
], {
  label: 'Nap',
  summary: 'Closed eyes with a slow pulse.',
  usage: 'Base sleepy state before aliasing.',
  status: 'active',
  tags: ['core', 'rest'],
  motionKind: 'loop',
  loop: true,
  order: 70,
});
