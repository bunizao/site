import { defineLook } from '../../model';
import { PEEK_LOOK_PALETTE } from '../../palette';

export const PEEK_CROWN_COSTUME = defineLook('peek.costume.crown', 'crown', 'costume', [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 6, 0, 0, 6, 0, 6, 0, 0, 6],
  [0, 6, 6, 6, 6, 6, 6, 6, 6, 6],
  [0, 6, 4, 6, 4, 6, 4, 6, 4, 6],
  [0, 6, 6, 6, 6, 6, 6, 6, 6, 6],
  [0, 1, 1, 0, 0, 0, 0, 1, 1, 0],
  [1, 1, 1, 0, 0, 0, 0, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 2, 1, 1, 1, 1, 2, 1, 1],
  [1, 1, 2, 1, 1, 3, 1, 2, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
], {
  label: 'crown',
  summary: 'Gold crown with ruby beads. Useful for paid or pro surfaces.',
  status: 'active',
  tags: ['costume'],
  palette: PEEK_LOOK_PALETTE,
  order: 360,
});
