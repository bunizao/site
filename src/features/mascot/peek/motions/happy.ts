import { defineMotion } from '../model';
import { PEEK_PURR_MOTION } from './purr';

export const PEEK_HAPPY_MOTION = defineMotion('peek.motion.happy', 'happy', 8, PEEK_PURR_MOTION.frames ?? [], {
  label: 'Happy',
  summary: 'Positive alias that reuses purr.',
  usage: 'Triggered when the active navbar section changes.',
  status: 'active',
  tags: ['alias', 'nav', 'positive'],
  motionKind: 'alias',
  aliasOf: 'peek.motion.purr',
  frameLabels: PEEK_PURR_MOTION.frameLabels,
  timeline: PEEK_PURR_MOTION.timeline,
  loop: true,
  order: 170,
});
