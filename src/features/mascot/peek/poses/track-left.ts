import { definePose } from '../model';
import { PEEK_POSE_LEFT } from './patterns';

export const PEEK_TRACK_LEFT_POSE = definePose('peek.pose.track-left', 'track_left', PEEK_POSE_LEFT, {
  label: 'Track Left',
  summary: 'Left static pose.',
  usage: 'Cursor-locked pose for left tracking.',
  status: 'active',
  tags: ['tracking', 'pose'],
  motionKind: 'pose',
  order: 130,
});
