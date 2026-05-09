import { defineLook } from '../../model';
import { PEEK_LOOK_PALETTE } from '../../palette';

export const PEEK_WINK_EXPRESSION = defineLook('peek.expression.wink', 'wink', 'expression', [
  [0, 1, 1, 0, 0, 0, 0, 1, 1, 0],
  [1, 1, 1, 0, 0, 0, 0, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 2, 1, 1],
  [1, 1, 2, 2, 1, 3, 1, 2, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
], {
  label: 'wink',
  summary: 'Left eye closed. Good for easter eggs and footers.',
  status: 'active',
  tags: ['expression'],
  palette: PEEK_LOOK_PALETTE,
  order: 220,
});
