import { definePose } from '../model';
import { PEEK_POSE_RIGHT } from './patterns';

export const PEEK_TRACK_RIGHT_POSE = definePose('peek.pose.track-right', 'track_right', PEEK_POSE_RIGHT, {
  label: 'Track Right',
  summary: 'Right static pose.',
  usage: 'Cursor-locked pose for right tracking.',
  status: 'active',
  tags: ['tracking', 'pose'],
  motionKind: 'pose',
  order: 150,
});
