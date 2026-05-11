import { defineMotion } from '../model';

const IDLE_OPEN = '.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########';
const IDLE_BLINK = '.##....##.|###....###|##########|##########|##########|##o##*#o##|##########';

export const PEEK_IDLE_MOTION = defineMotion('peek.motion.idle', 'idle', 2, [
  IDLE_OPEN, IDLE_OPEN, IDLE_OPEN, IDLE_OPEN,
  IDLE_OPEN, IDLE_OPEN, IDLE_OPEN, IDLE_OPEN,
  IDLE_BLINK,
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
