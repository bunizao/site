import { defineLook } from '../../model';
import { PEEK_LOOK_PALETTE } from '../../palette';

export const PEEK_ERROR_EXPRESSION = defineLook('peek.expression.error', 'error', 'expression', [
  [0, 1, 1, 0, 0, 0, 0, 1, 1, 0],
  [1, 1, 1, 0, 0, 0, 0, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 2, 1, 2, 1, 1, 1, 2, 1, 2],
  [1, 1, 2, 1, 1, 3, 1, 1, 2, 1],
  [1, 2, 1, 2, 1, 1, 1, 2, 1, 2],
], {
  label: 'error',
  summary: 'X eyes. Useful for errors and bad input.',
  status: 'active',
  tags: ['expression'],
  palette: PEEK_LOOK_PALETTE,
  order: 250,
});
