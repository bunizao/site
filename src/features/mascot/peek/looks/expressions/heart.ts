import { defineLook } from '../../model';
import { PEEK_LOOK_PALETTE } from '../../palette';

export const PEEK_HEART_EXPRESSION = defineLook('peek.expression.heart', 'heart', 'expression', [
  [0, 1, 1, 0, 0, 0, 0, 1, 1, 0],
  [1, 1, 1, 0, 0, 0, 0, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 4, 1, 4, 1, 1, 1, 4, 1, 4],
  [1, 4, 4, 4, 1, 1, 1, 4, 4, 4],
  [1, 1, 4, 1, 1, 3, 1, 1, 4, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
], {
  label: 'heart',
  summary: 'Pixel hearts for eyes. Useful for thanks or celebratory pages.',
  status: 'active',
  tags: ['expression'],
  palette: PEEK_LOOK_PALETTE,
  order: 230,
});
