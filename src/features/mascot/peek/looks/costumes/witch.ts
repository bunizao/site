import { defineLook } from '../../model';
import { PEEK_LOOK_PALETTE } from '../../palette';

export const PEEK_WITCH_COSTUME = defineLook('peek.costume.witch', 'witch', 'costume', [
  [0, 0, 0, 0, 0, 8, 0, 0, 0, 0],
  [0, 0, 0, 0, 8, 8, 8, 0, 0, 0],
  [0, 0, 0, 8, 8, 8, 8, 8, 0, 0],
  [0, 0, 8, 8, 8, 7, 8, 8, 8, 0],
  [0, 7, 7, 7, 7, 7, 7, 7, 7, 0],
  [0, 1, 1, 0, 0, 0, 0, 1, 1, 0],
  [1, 1, 1, 0, 0, 0, 0, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 2, 1, 1, 1, 1, 2, 1, 1],
  [1, 1, 2, 1, 1, 3, 1, 2, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
], {
  label: 'witch',
  summary: 'Halloween variant with a pointy hat and green band.',
  status: 'active',
  tags: ['costume'],
  palette: PEEK_LOOK_PALETTE,
  order: 330,
});
