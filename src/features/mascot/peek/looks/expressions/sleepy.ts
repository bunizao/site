import { defineLook } from '../../model';
import { PEEK_LOOK_PALETTE } from '../../palette';

export const PEEK_SLEEPY_EXPRESSION = defineLook('peek.expression.sleepy', 'sleepy', 'expression', [
  [0, 1, 1, 0, 0, 0, 0, 1, 1, 0],
  [1, 1, 1, 0, 0, 0, 0, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 2, 2, 1, 3, 1, 2, 2, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
], {
  label: 'sleepy',
  summary: 'Eyes shut. Good for deep-night reading or offline states.',
  status: 'active',
  tags: ['expression'],
  palette: PEEK_LOOK_PALETTE,
  order: 240,
});
