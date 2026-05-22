import { defineMotion } from '../model';
import { PEEK_NAP_MOTION } from './nap';

export const PEEK_SLEEPY_MOTION = defineMotion('peek.motion.sleepy', 'sleepy', 4, PEEK_NAP_MOTION.frames ?? [], {
  label: 'Sleepy',
  summary: 'Idle alias that reuses nap.',
  usage: 'Triggered after long inactivity in the navbar.',
  status: 'active',
  tags: ['alias', 'nav', 'idle-timeout'],
  motionKind: 'alias',
  aliasOf: 'peek.motion.nap',
  frameLabels: PEEK_NAP_MOTION.frameLabels,
  timeline: PEEK_NAP_MOTION.timeline,
  loop: true,
  order: 180,
});
