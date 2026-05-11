import { defineMotion } from '../model';

export const PEEK_ALERT_MOTION = defineMotion('peek.motion.alert', 'alert', 14, [
  '.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########',
  '.##....##.|.##....##.|###....###|##########|##oo##oo##|##oo#*oo##|##########',
  '.##....##.|.##....##.|###....###|##########|##oo##oo##|##oo**oo##|##########',
  '.##....##.|.##....##.|###....###|##########|##oo##oo##|##oo#*oo##|##########',
  '.##....##.|.##....##.|###....###|##########|##oo##oo##|##oo#*oo##|##########',
], {
  label: 'Alert',
  summary: 'Snaps to center and opens into 2x2 eyes.',
  usage: 'Best for short attention grabs or sudden state changes.',
  status: 'active',
  tags: ['utility', 'burst'],
  motionKind: 'one-shot',
  loop: false,
  previewLoop: true,
  order: 90,
});
