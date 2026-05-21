import { definePose } from '../model';
import { PEEK_BASE } from '../base';
import { compose } from '../compose';
import { sparse } from '../layer';

export const PEEK_TRACK_FAR_RIGHT_POSE = definePose(
  'peek.pose.track-far-right',
  'track_far_right',
  compose(
    PEEK_BASE.base,
    sparse([
      [7, 0, -1],
      [7, 1, -1],
      [2, 4, 1],
      [4, 4, 2],
      [7, 4, 1],
      [9, 4, 2],
      [2, 5, 1],
      [4, 5, 2],
      [5, 5, 1],
      [6, 5, 3],
      [7, 5, 1],
      [9, 5, 2],
    ]),
  ),
  {
    label: 'Track Far Right',
    summary: 'Hard right static pose.',
    usage: 'Cursor-locked pose for the furthest right tracking bucket.',
    status: 'active',
    tags: ['tracking', 'pose'],
    motionKind: 'pose',
    order: 160,
  },
);
