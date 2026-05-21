import { PEEK_BASE } from '../base';
import { compose } from '../compose';
import { sparse } from '../layer';
import { defineMotion } from '../model';

const OPEN = PEEK_BASE.base;
const BLINK = compose(PEEK_BASE.base, sparse([
  [2, 4, 1],
  [7, 4, 1],
]));

export const PEEK_IDLE_MOTION = defineMotion('peek.motion.idle', 'idle', 2, [
  OPEN, OPEN, OPEN, OPEN,
  OPEN, OPEN, OPEN, OPEN,
  BLINK,
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
