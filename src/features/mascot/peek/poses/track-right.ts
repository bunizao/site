import { definePose } from '../model';
import { PEEK_BASE } from '../base';
import { compose } from '../compose';
import { sparse } from '../layer';

export const PEEK_TRACK_RIGHT_POSE = definePose(
  'peek.pose.track-right',
  'track_right',
  compose(
    PEEK_BASE.base,
    sparse([
      [0, 0, 1],
      [2, 4, 1],
      [3, 4, 2],
      [7, 4, 1],
      [8, 4, 2],
      [2, 5, 1],
      [3, 5, 2],
      [7, 5, 1],
      [8, 5, 2],
    ]),
  ),
  {
    label: 'Track Right',
    summary: 'Right static pose.',
    usage: 'Cursor-locked pose for right tracking.',
    status: 'active',
    tags: ['tracking', 'pose'],
    motionKind: 'pose',
    order: 150,
  },
);
