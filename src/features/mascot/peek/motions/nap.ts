import { PEEK_BASE } from '../base';
import { compose } from '../compose';
import { sparse } from '../layer';
import { defineMotion } from '../model';

const NOSE = compose(PEEK_BASE.base, sparse([
  [2, 4, 1],
  [7, 4, 1],
  [2, 5, 1],
  [7, 5, 1],
]));

const REST = compose(PEEK_BASE.base, sparse([
  [2, 4, 1],
  [7, 4, 1],
  [2, 5, 1],
  [5, 5, 1],
  [7, 5, 1],
]));

export const PEEK_NAP_FRAMES = [NOSE, REST, NOSE, REST] as const;

export const PEEK_NAP_MOTION = defineMotion('peek.motion.nap', 'nap', 3, PEEK_NAP_FRAMES, {
  label: 'Nap',
  summary: 'Closed eyes with a slow pulse.',
  usage: 'Base sleepy state before aliasing.',
  status: 'active',
  tags: ['core', 'rest'],
  motionKind: 'loop',
  loop: true,
  order: 70,
});
