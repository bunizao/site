import { defineLook } from '../../model';
import { PEEK_LOOK_PALETTE } from '../../palette';

export const PEEK_STARRY_EXPRESSION = defineLook('peek.expression.starry', 'starry', 'expression', [
  [0, 1, 1, 0, 0, 0, 0, 1, 1, 0],
  [1, 1, 1, 0, 0, 0, 0, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 6, 1, 1, 1, 1, 6, 1, 1],
  [1, 6, 6, 6, 1, 1, 1, 6, 6, 6],
  [1, 1, 6, 1, 1, 3, 1, 1, 6, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
], {
  label: 'starry',
  summary: 'Sparkle eyes. Useful for launches and success toasts.',
  status: 'active',
  tags: ['expression'],
  palette: PEEK_LOOK_PALETTE,
  order: 260,
});
