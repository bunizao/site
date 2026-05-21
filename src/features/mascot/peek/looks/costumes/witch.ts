import { defineLook } from '../../model';
import { PEEK_LOOK_PALETTE } from '../../palette';
import { withBody } from './body';

const _ = 0;
const K = 8;
const G = 7;
const Y = 6;

const HAT = [
  [_,_,_,_,_,_,_,_,_,_,_,_,K,K,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,K,K,K,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,K,K,K,K,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,K,K,K,K,K,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,K,K,K,Y,K,K,K,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,K,K,K,K,K,K,K,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,K,K,K,K,K,K,K,K,K,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,K,K,K,K,K,K,K,K,K,K,K,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,K,K,K,K,K,K,K,K,K,K,K,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,K,K,K,K,K,K,K,K,K,K,K,K,K,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,K,K,K,K,K,K,K,K,K,K,K,K,K,K,K,_,_,_,_,_,_,_,_],
  [_,_,_,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,_,_,_],
  [_,_,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,_,_],
  [_,G,G,G,G,G,G,G,G,G,G,G,G,G,Y,G,G,G,G,G,G,G,G,G,G,G,G,G,G,_],
  [G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G],
];

export const PEEK_WITCH_COSTUME = defineLook(
  'peek.costume.witch',
  'witch',
  'costume',
  withBody(HAT),
  {
    label: 'witch',
    summary: 'Halloween variant. Pointy black hat with green brim and gold buckle.',
    status: 'active',
    tags: ['costume'],
    palette: PEEK_LOOK_PALETTE,
    order: 330,
  },
);
