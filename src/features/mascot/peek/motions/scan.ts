import { defineMotion } from '../model';
import { PEEK_TRACK_CENTER_POSE } from '../poses/track-center';
import { PEEK_TRACK_FAR_LEFT_POSE } from '../poses/track-far-left';
import { PEEK_TRACK_FAR_RIGHT_POSE } from '../poses/track-far-right';
import { PEEK_TRACK_LEFT_POSE } from '../poses/track-left';
import { PEEK_TRACK_RIGHT_POSE } from '../poses/track-right';

const FAR_LEFT = PEEK_TRACK_FAR_LEFT_POSE.grid!;
const LEFT = PEEK_TRACK_LEFT_POSE.grid!;
const CENTER = PEEK_TRACK_CENTER_POSE.grid!;
const RIGHT = PEEK_TRACK_RIGHT_POSE.grid!;
const FAR_RIGHT = PEEK_TRACK_FAR_RIGHT_POSE.grid!;

export const PEEK_SCAN_MOTION = defineMotion('peek.motion.scan', 'scan', 7, [
  LEFT,
  LEFT,
  FAR_LEFT,
  FAR_LEFT,
  LEFT,
  CENTER,
  RIGHT,
  FAR_RIGHT,
  FAR_RIGHT,
  RIGHT,
  RIGHT,
  CENTER,
  CENTER,
  LEFT,
], {
  label: 'Scan',
  summary: 'Off-center search pattern across five head poses.',
  usage: 'Ambient search motion for sidebar and 404 interactions.',
  status: 'active',
  tags: ['tracking', 'ambient'],
  motionKind: 'loop',
  loop: true,
  order: 80,
});
