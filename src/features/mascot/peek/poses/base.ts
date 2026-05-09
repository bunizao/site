import { PEEK_BASE } from '../base';
import { definePose } from '../model';

export const PEEK_BASE_POSE = definePose('peek.pose.base', 'base', PEEK_BASE.base, {
  label: 'Base',
  summary: 'Static brand grid used by SVG consumers.',
  status: 'active',
  tags: ['brand', 'static'],
  motionKind: 'pose',
  order: 110,
});
