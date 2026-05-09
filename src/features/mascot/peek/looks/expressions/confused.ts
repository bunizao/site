import { defineLook } from '../../model';
import { PEEK_LOOK_PALETTE } from '../../palette';

export const PEEK_CONFUSED_EXPRESSION = defineLook('peek.expression.confused', 'confused', 'expression', [
  [0, 1, 1, 0, 0, 0, 0, 1, 1, 0],
  [1, 1, 1, 0, 0, 0, 0, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 2, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 2, 1, 1, 3, 1, 2, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 2, 1, 1],
], {
  label: 'confused',
  summary: 'Asymmetric eyes with one droop. Good for lost states and 404 usage.',
  status: 'active',
  tags: ['expression'],
  palette: PEEK_LOOK_PALETTE,
  order: 210,
});
