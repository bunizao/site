import { defineLook } from '../../model';
import { PEEK_LOOK_PALETTE } from '../../palette';
import { withBody } from './body';

const _ = 0;
const G = 6;
const R = 4;
const Y = 3;

const HAT = [
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,G,G,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,G,G,G,G,_,_,_,_,G,G,_,_,_,_,_,_,G,G,_,_,_,_,_,_],
  [_,_,_,_,_,G,G,Y,Y,G,G,_,_,G,G,G,G,_,_,_,_,G,G,G,G,_,_,_,_,_],
  [_,_,_,_,G,G,Y,R,Y,G,G,G,G,G,Y,Y,G,G,_,_,G,G,Y,Y,G,G,_,_,_,_],
  [_,_,_,_,G,G,Y,Y,Y,G,G,G,G,Y,R,R,Y,G,G,G,G,Y,R,R,Y,G,G,_,_,_],
  [_,_,_,_,G,G,G,G,G,G,G,G,G,Y,R,R,Y,G,G,G,G,Y,R,R,Y,G,G,_,_,_],
  [_,_,_,_,_,G,G,G,G,G,G,G,G,G,Y,Y,G,G,_,_,G,G,Y,Y,G,G,_,_,_,_],
  [_,_,_,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,_],
  [_,_,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G],
  [_,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G],
  [G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G],
  [G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G],
];

export const PEEK_CROWN_COSTUME = defineLook(
  'peek.costume.crown',
  'crown',
  'costume',
  withBody(HAT),
  {
    label: 'crown',
    summary: 'Gold crown with three gem peaks and ruby beads. Useful for paid or pro surfaces.',
    status: 'active',
    tags: ['costume'],
    palette: PEEK_LOOK_PALETTE,
    order: 360,
  },
);
