import { PEEK_BASE } from '../base';
import { sparse } from '../layer';
import { beat, composeFrame, defineTimelineMotion } from '../timeline';

const SHELL_DELTA = sparse([
  [0, 1, -1],
  [9, 1, -1],
  [3, 2, -1],
  [4, 2, -1],
  [5, 2, -1],
  [6, 2, -1],
]);

const WIDE = composeFrame('wide', PEEK_BASE.base, SHELL_DELTA, sparse([
  [3, 4, 2],
  [6, 4, 2],
  [3, 5, 2],
  [6, 5, 2],
]));

const HOLD = composeFrame('hold', PEEK_BASE.base, SHELL_DELTA, sparse([
  [3, 4, 2],
  [6, 4, 2],
  [3, 5, 2],
  [4, 5, 3],
  [6, 5, 2],
]));

export const PEEK_ALERT_MOTION = defineTimelineMotion('peek.motion.alert', 'alert', 14, [
  WIDE,
  HOLD,
], [
  beat(0, 1, 'wide'),
  beat(1, 1, 'hold'),
  beat(0, 3, 'wide'),
], {
  label: 'Alert',
  summary: 'Snaps to center and opens into 2x2 eyes.',
  usage: 'Best for short attention grabs or sudden state changes.',
  status: 'active',
  tags: ['utility', 'burst'],
  motionKind: 'one-shot',
  loop: false,
  previewLoop: true,
  order: 90,
});
