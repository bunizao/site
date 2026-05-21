import { PEEK_BASE } from '../base';
import { compose } from '../compose';
import { sparse } from '../layer';
import { defineMotion } from '../model';

const SQUINT_NOSE = compose(PEEK_BASE.base, sparse([
  [2, 4, 1],
  [7, 4, 1],
  [3, 5, 2],
  [4, 5, 3],
  [5, 5, 1],
  [6, 5, 2],
]));

const SQUINT_PUFF = compose(PEEK_BASE.base, sparse([
  [2, 4, 1],
  [7, 4, 1],
  [3, 5, 2],
  [4, 5, 3],
  [6, 5, 2],
]));

const BLINK = compose(PEEK_BASE.base, sparse([
  [2, 4, 1],
  [7, 4, 1],
]));

export const PEEK_PURR_FRAMES = [SQUINT_NOSE, SQUINT_PUFF, SQUINT_NOSE, BLINK, SQUINT_PUFF, SQUINT_NOSE] as const;

export const PEEK_PURR_MOTION = defineMotion('peek.motion.purr', 'purr', 8, PEEK_PURR_FRAMES, {
  label: 'Purr',
  summary: 'Squinting eyes and a pulsing nose.',
  usage: 'The friendly baseline for positive reactions.',
  status: 'active',
  tags: ['core', 'warm'],
  motionKind: 'loop',
  loop: true,
  order: 50,
});
