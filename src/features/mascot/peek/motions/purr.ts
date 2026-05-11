import { defineMotion } from '../model';

const PURR_FRAMES = [
  '.##....##.|###....###|##########|##########|##########|##oo*#oo##|##########',
  '.##....##.|###....###|##########|##########|##########|##oo**oo##|##########',
  '.##....##.|###....###|##########|##########|##########|##oo*#oo##|##########',
  '.##....##.|###....###|##########|##########|##########|##o##*#o##|##########',
  '.##....##.|###....###|##########|##########|##########|##oo**oo##|##########',
  '.##....##.|###....###|##########|##########|##########|##oo*#oo##|##########',
] as const;

export const PEEK_PURR_FRAMES = PURR_FRAMES;

export const PEEK_PURR_MOTION = defineMotion('peek.motion.purr', 'purr', 8, PURR_FRAMES, {
  label: 'Purr',
  summary: 'Squinting eyes and a pulsing nose.',
  usage: 'The friendly baseline for positive reactions.',
  status: 'active',
  tags: ['core', 'warm'],
  motionKind: 'loop',
  loop: true,
  order: 50,
});
