import { defineLook } from '../../model';
import { PEEK_LOOK_PALETTE } from '../../palette';

export const PEEK_HEADPHONES_COSTUME = defineLook('peek.costume.headphones', 'headphones', 'costume', [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 8, 8, 8, 8, 8, 8, 0, 0],
  [0, 8, 8, 0, 0, 0, 0, 8, 8, 0],
  [8, 8, 0, 0, 0, 0, 0, 0, 8, 8],
  [8, 8, 1, 0, 0, 0, 0, 1, 8, 8],
  [8, 8, 1, 0, 0, 0, 0, 1, 8, 8],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 2, 1, 1, 1, 1, 2, 1, 1],
  [1, 1, 2, 1, 1, 3, 1, 2, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
], {
  label: 'headphones',
  summary: 'Cups over the ears. Useful for links to listening surfaces.',
  status: 'active',
  tags: ['costume'],
  palette: PEEK_LOOK_PALETTE,
  order: 350,
});
