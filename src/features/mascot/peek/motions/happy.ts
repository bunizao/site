import { defineMotion } from '../model';
import { PEEK_PURR_FRAMES } from './purr';

export const PEEK_HAPPY_MOTION = defineMotion('peek.motion.happy', 'happy', 8, PEEK_PURR_FRAMES, {
  label: 'Happy',
  summary: 'Positive alias that reuses purr.',
  usage: 'Triggered when the active navbar section changes.',
  status: 'active',
  tags: ['alias', 'nav', 'positive'],
  motionKind: 'alias',
  aliasOf: 'peek.motion.purr',
  loop: true,
  order: 170,
});
