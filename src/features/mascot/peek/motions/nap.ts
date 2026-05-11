import { defineMotion } from '../model';

const NAP_FRAMES = [
  '.##....##.|###....###|##########|##########|##########|#####*####|##########',
  '.##....##.|###....###|##########|##########|##########|##########|##########',
  '.##....##.|###....###|##########|##########|##########|#####*####|##########',
  '.##....##.|###....###|##########|##########|##########|##########|##########',
] as const;

export const PEEK_NAP_FRAMES = NAP_FRAMES;

export const PEEK_NAP_MOTION = defineMotion('peek.motion.nap', 'nap', 3, NAP_FRAMES, {
  label: 'Nap',
  summary: 'Closed eyes with a slow pulse.',
  usage: 'Base sleepy state before aliasing.',
  status: 'active',
  tags: ['core', 'rest'],
  motionKind: 'loop',
  loop: true,
  order: 70,
});
