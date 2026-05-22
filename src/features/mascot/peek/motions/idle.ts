import { PEEK_BASE } from '../base';
import { sparse } from '../layer';
import { beat, composeFrame, defineTimelineMotion, frame } from '../timeline';

const OPEN = frame('open', PEEK_BASE.base);
const BLINK = composeFrame('blink', PEEK_BASE.base, sparse([
  [2, 4, 1],
  [7, 4, 1],
]));

export const PEEK_IDLE_MOTION = defineTimelineMotion('peek.motion.idle', 'idle', 2, [
  OPEN,
  BLINK,
], [
  beat(0, 8, 'rest'),
  beat(1, 1, 'blink'),
], {
  label: 'Idle',
  summary: 'Rare slow blink with a steady rest state.',
  usage: 'Default rest state in the navbar.',
  status: 'active',
  tags: ['core', 'nav'],
  motionKind: 'loop',
  loop: true,
  order: 10,
});
