import { definePose } from '../model';
import { PEEK_POSE_FAR_LEFT } from './patterns';

export const PEEK_TRACK_FAR_LEFT_POSE = definePose('peek.pose.track-far-left', 'track_far_left', PEEK_POSE_FAR_LEFT, {
  label: 'Track Far Left',
  summary: 'Hard left static pose.',
  usage: 'Cursor-locked pose for the furthest left tracking bucket.',
  status: 'active',
  tags: ['tracking', 'pose'],
  motionKind: 'pose',
  order: 120,
});
