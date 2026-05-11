import { defineLook } from '../../model';
import { PEEK_LOOK_PALETTE } from '../../palette';

export const PEEK_LANTERN_COSTUME = defineLook('peek.costume.lantern', 'lantern', 'costume', [
  [0, 0, 0, 0, 0, 0, 0, 0, 8, 0],
  [0, 0, 0, 0, 0, 0, 0, 4, 4, 4],
  [0, 0, 0, 0, 0, 0, 0, 4, 6, 4],
  [0, 0, 0, 0, 0, 0, 0, 4, 4, 4],
  [0, 0, 0, 0, 0, 0, 0, 0, 4, 0],
  [0, 1, 1, 0, 0, 0, 0, 1, 1, 0],
  [1, 1, 1, 0, 0, 0, 0, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 2, 1, 1, 1, 1, 2, 1, 1],
  [1, 1, 2, 1, 1, 3, 1, 2, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
], {
  label: 'lantern',
  summary: 'Spring Festival variant with a lantern on the right edge.',
  status: 'active',
  tags: ['costume'],
  palette: PEEK_LOOK_PALETTE,
  order: 340,
});
