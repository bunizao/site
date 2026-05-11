import { defineMotion } from '../model';

export const PEEK_HIDE_MOTION = defineMotion('peek.motion.hide', 'hide', 12, [
  '.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########',
  '..........|.##....##.|###....###|##########|##o####o##|##o##*#o##|##########',
  '..........|..........|.##....##.|###....###|##o####o##|##o##*#o##|##########',
  '..........|..........|..........|.##....##.|##o####o##|##o##*#o##|##########',
  '..........|..........|..........|..........|.##....##.|##o##*#o##|##########',
  '..........|..........|..........|..........|..........|##########|##########',
], {
  label: 'Hide',
  summary: 'Drops below the ledge, then peeks back up.',
  usage: 'Useful when the mascot should retreat without disappearing entirely.',
  status: 'active',
  tags: ['core', 'transition'],
  motionKind: 'loop',
  loop: true,
  order: 20,
});
