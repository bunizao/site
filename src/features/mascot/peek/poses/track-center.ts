import { definePose } from '../model';
import { PEEK_POSE_CENTER } from './patterns';

export const PEEK_TRACK_CENTER_POSE = definePose('peek.pose.track-center', 'track_center', PEEK_POSE_CENTER, {
  label: 'Track Center',
  summary: 'Centered static pose.',
  usage: 'Neutral lock state when the mascot faces forward.',
  status: 'active',
  tags: ['tracking', 'pose'],
  motionKind: 'pose',
  order: 140,
});
