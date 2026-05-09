import { defineLook } from '../../model';
import { PEEK_LOOK_PALETTE } from '../../palette';

export const PEEK_CRY_EXPRESSION = defineLook('peek.expression.cry', 'cry', 'expression', [
  [0, 1, 1, 0, 0, 0, 0, 1, 1, 0],
  [1, 1, 1, 0, 0, 0, 0, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 2, 1, 1, 1, 1, 2, 1, 1],
  [1, 1, 2, 1, 1, 3, 1, 2, 1, 1],
  [1, 1, 1, 8, 1, 1, 1, 1, 8, 1],
], {
  label: 'cry',
  summary: 'A single tear. Useful for empty inbox and no-result states.',
  status: 'active',
  tags: ['expression'],
  palette: PEEK_LOOK_PALETTE,
  order: 280,
});
