import { defineLook } from '../../model';
import { PEEK_LOOK_PALETTE } from '../../palette';
import { withBody } from './body';

const _ = 0;
const Y = 6;
const R = 4;
const G = 7;
const W = 5;

const HAT = [
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,Y,Y,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,Y,Y,Y,Y,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,Y,Y,Y,Y,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,R,R,R,R,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,R,R,W,R,R,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,R,R,R,R,R,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,R,R,Y,R,R,Y,R,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,R,R,R,R,R,R,R,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,R,R,R,R,W,R,R,R,R,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,R,R,Y,R,R,R,Y,R,R,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,R,R,R,R,R,R,R,R,R,R,R,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,R,R,R,W,R,R,Y,R,R,W,R,R,R,_,_,_,_,_,_,_,_,_],
  [_,_,_,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,_,_,_],
  [_,_,_,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,_,_,_],
  [_,_,_,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,_,_,_],
];

export const PEEK_PARTY_COSTUME = defineLook(
  'peek.costume.party',
  'party',
  'costume',
  withBody(HAT),
  {
    label: 'party',
    summary: 'Launch days, anniversary, birthday mode. Cone hat with confetti and green band.',
    status: 'active',
    tags: ['costume'],
    palette: PEEK_LOOK_PALETTE,
    order: 320,
  },
);
