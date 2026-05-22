import { definePose } from '../model';
import { PEEK_BASE } from '../base';

export const PEEK_TRACK_CENTER_POSE = definePose(
  'peek.pose.track-center',
  'track_center',
  PEEK_BASE.base,
  {
    label: 'Track Center',
    summary: 'Centered static pose.',
    usage: 'Neutral lock state when the mascot faces forward.',
    status: 'active',
    tags: ['tracking', 'pose'],
    motionKind: 'pose',
    order: 140,
  },
);
