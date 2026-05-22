import { definePose } from '../model';
import { PEEK_BASE } from '../base';
import { compose } from '../compose';
import { sparse } from '../layer';

export const PEEK_TRACK_FAR_LEFT_POSE = definePose(
  'peek.pose.track-far-left',
  'track_far_left',
  compose(
    PEEK_BASE.base,
    sparse([
      [2, 0, -1],
      [2, 1, -1],
      [0, 4, 2],
      [2, 4, 1],
      [5, 4, 2],
      [7, 4, 1],
      [0, 5, 2],
      [2, 5, 1],
      [3, 5, 3],
      [5, 5, 2],
      [7, 5, 1],
    ]),
  ),
  {
    label: 'Track Far Left',
    summary: 'Hard left static pose.',
    usage: 'Cursor-locked pose for the furthest left tracking bucket.',
    status: 'active',
    tags: ['tracking', 'pose'],
    motionKind: 'pose',
    order: 120,
  },
);
