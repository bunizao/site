import { definePose } from '../model';
import { PEEK_BASE } from '../base';
import { compose } from '../compose';
import { sparse } from '../layer';

export const PEEK_TRACK_LEFT_POSE = definePose(
  'peek.pose.track-left',
  'track_left',
  compose(
    PEEK_BASE.base,
    sparse([
      [9, 0, 1],
      [1, 4, 2],
      [2, 4, 1],
      [6, 4, 2],
      [7, 4, 1],
      [1, 5, 2],
      [2, 5, 1],
      [4, 5, 3],
      [5, 5, 1],
      [6, 5, 2],
      [7, 5, 1],
    ]),
  ),
  {
    label: 'Track Left',
    summary: 'Left static pose.',
    usage: 'Cursor-locked pose for left tracking.',
    status: 'active',
    tags: ['tracking', 'pose'],
    motionKind: 'pose',
    order: 130,
  },
);
