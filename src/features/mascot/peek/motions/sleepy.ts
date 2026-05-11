import { defineMotion } from '../model';
import { PEEK_NAP_FRAMES } from './nap';

export const PEEK_SLEEPY_MOTION = defineMotion('peek.motion.sleepy', 'sleepy', 4, PEEK_NAP_FRAMES, {
  label: 'Sleepy',
  summary: 'Idle alias that reuses nap.',
  usage: 'Triggered after long inactivity in the navbar.',
  status: 'active',
  tags: ['alias', 'nav', 'idle-timeout'],
  motionKind: 'alias',
  aliasOf: 'peek.motion.nap',
  loop: true,
  order: 180,
});
