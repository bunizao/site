import { defineMotion } from '../model';
import {
  PEEK_POSE_CENTER,
  PEEK_POSE_FAR_LEFT,
  PEEK_POSE_FAR_RIGHT,
  PEEK_POSE_LEFT,
  PEEK_POSE_RIGHT,
} from '../poses/patterns';

export const PEEK_SCAN_MOTION = defineMotion('peek.motion.scan', 'scan', 7, [
  PEEK_POSE_LEFT,
  PEEK_POSE_LEFT,
  PEEK_POSE_FAR_LEFT,
  PEEK_POSE_FAR_LEFT,
  PEEK_POSE_LEFT,
  PEEK_POSE_CENTER,
  PEEK_POSE_RIGHT,
  PEEK_POSE_FAR_RIGHT,
  PEEK_POSE_FAR_RIGHT,
  PEEK_POSE_RIGHT,
  PEEK_POSE_RIGHT,
  PEEK_POSE_CENTER,
  PEEK_POSE_CENTER,
  PEEK_POSE_LEFT,
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
