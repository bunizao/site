import { beat, defineTimelineMotion, frame } from '../timeline';
import { PEEK_TRACK_CENTER_POSE } from '../poses/track-center';
import { PEEK_TRACK_FAR_LEFT_POSE } from '../poses/track-far-left';
import { PEEK_TRACK_FAR_RIGHT_POSE } from '../poses/track-far-right';
import { PEEK_TRACK_LEFT_POSE } from '../poses/track-left';
import { PEEK_TRACK_RIGHT_POSE } from '../poses/track-right';

const FAR_LEFT = frame('far-left', PEEK_TRACK_FAR_LEFT_POSE.grid!);
const LEFT = frame('left', PEEK_TRACK_LEFT_POSE.grid!);
const CENTER = frame('center', PEEK_TRACK_CENTER_POSE.grid!);
const RIGHT = frame('right', PEEK_TRACK_RIGHT_POSE.grid!);
const FAR_RIGHT = frame('far-right', PEEK_TRACK_FAR_RIGHT_POSE.grid!);

export const PEEK_SCAN_MOTION = defineTimelineMotion('peek.motion.scan', 'scan', 7, [
  LEFT,
  FAR_LEFT,
  CENTER,
  RIGHT,
  FAR_RIGHT,
], [
  beat(0, 2, 'left'),
  beat(1, 2, 'far-left'),
  beat(0, 1, 'left'),
  beat(2, 1, 'center'),
  beat(3, 1, 'right'),
  beat(4, 2, 'far-right'),
  beat(3, 2, 'right'),
  beat(2, 2, 'center'),
  beat(0, 1, 'left'),
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
