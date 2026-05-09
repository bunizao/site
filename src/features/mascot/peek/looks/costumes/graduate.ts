import { defineLook } from '../../model';
import { PEEK_LOOK_PALETTE } from '../../palette';

export const PEEK_GRADUATE_COSTUME = defineLook('peek.costume.graduate', 'graduate', 'costume', [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 8, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 8, 8, 0, 0, 0, 0],
  [8, 8, 8, 8, 8, 8, 8, 8, 8, 8],
  [0, 0, 0, 8, 8, 8, 8, 0, 0, 0],
  [0, 1, 1, 0, 0, 0, 0, 1, 1, 0],
  [1, 1, 1, 0, 0, 0, 0, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 2, 1, 1, 1, 1, 2, 1, 1],
  [1, 1, 2, 1, 1, 3, 1, 2, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
], {
  label: 'graduate',
  summary: 'Mortarboard with tassel. Useful for finished-course or milestone pages.',
  status: 'active',
  tags: ['costume'],
  palette: PEEK_LOOK_PALETTE,
  order: 370,
});
