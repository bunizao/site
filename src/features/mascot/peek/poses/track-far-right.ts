import { definePose } from '../model';
import { PEEK_POSE_FAR_RIGHT } from './patterns';

export const PEEK_TRACK_FAR_RIGHT_POSE = definePose('peek.pose.track-far-right', 'track_far_right', PEEK_POSE_FAR_RIGHT, {
  label: 'Track Far Right',
  summary: 'Hard right static pose.',
  usage: 'Cursor-locked pose for the furthest right tracking bucket.',
  status: 'active',
  tags: ['tracking', 'pose'],
  motionKind: 'pose',
  order: 160,
});
