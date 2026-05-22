import { defineLook } from '../../model';
import { PEEK_LOOK_PALETTE } from '../../palette';
import { withBody } from './body';

const _ = 0;
const P = 9;
const G = 7;
const Y = 6;

const HAT = [
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,Y,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,P,P,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,P,P,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,P,P,P,P,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,P,P,P,P,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,P,P,Y,P,P,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,P,P,P,P,P,P,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,P,P,P,P,P,P,P,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,P,P,P,P,P,P,P,P,P,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,P,P,P,P,Y,P,P,P,P,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,P,P,P,P,P,P,P,P,P,P,P,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,P,P,P,P,P,P,P,P,P,P,P,P,P,_,_,_,_,_,_,_,_,_],
  [_,Y,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,Y,_],
  [Y,Y,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,Y,Y],
  [_,Y,_,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,_,Y,_],
];

export const PEEK_WITCH_COSTUME = defineLook(
  'peek.costume.witch',
  'witch',
  'costume',
  withBody(HAT),
  {
    label: 'witch',
    summary: 'Halloween variant. Tall purple wizard hat with gold stars and green brim.',
    status: 'active',
    tags: ['costume'],
    palette: PEEK_LOOK_PALETTE,
    order: 330,
  },
);
