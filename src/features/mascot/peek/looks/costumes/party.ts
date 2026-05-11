import { defineLook } from '../../model';
import { PEEK_LOOK_PALETTE } from '../../palette';

export const PEEK_PARTY_COSTUME = defineLook('peek.costume.party', 'party', 'costume', [
  [0, 0, 0, 0, 6, 0, 0, 0, 0, 0],
  [0, 0, 0, 6, 6, 6, 0, 0, 0, 0],
  [0, 0, 0, 4, 5, 4, 0, 0, 0, 0],
  [0, 0, 4, 4, 4, 4, 4, 0, 0, 0],
  [0, 7, 7, 7, 7, 7, 7, 7, 7, 0],
  [0, 1, 1, 0, 0, 0, 0, 1, 1, 0],
  [1, 1, 1, 0, 0, 0, 0, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 2, 1, 1, 1, 1, 2, 1, 1],
  [1, 1, 2, 1, 1, 3, 1, 2, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
], {
  label: 'party',
  summary: 'Launch days, anniversary, and birthday mode.',
  status: 'active',
  tags: ['costume'],
  palette: PEEK_LOOK_PALETTE,
  order: 320,
});
