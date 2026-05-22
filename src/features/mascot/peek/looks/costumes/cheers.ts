import { defineLook } from '../../model';
import { PEEK_LOOK_PALETTE } from '../../palette';

const _ = 0;
const R = 4;
const W = 5;
const Y = 6;
const K = 8;
const B = 11;
const P = 12;

const ROWS = [
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,B,B,B,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,Y,Y,_,_,_,_,_,B,B,B,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,R,P,_,_,_,_,_,_,_,_,_,_,_,Y,Y,Y,_,_,R,R,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,B,B,_,_,Y,Y,Y,R,_,_,R,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,W,W,W,W,W,W,_,_,_,R,R,R,R,R,_,_,W,W,W,W,W,_,_,B,B,_],
  [_,_,_,_,W,W,W,W,W,W,_,_,_,R,R,Y,Y,Y,R,_,W,W,W,W,W,_,_,_,_,_],
  [B,_,W,W,W,W,W,W,W,W,_,_,Y,Y,Y,Y,Y,R,R,_,W,W,W,W,W,W,W,_,_,_],
  [B,_,W,W,W,W,W,W,W,W,_,B,Y,Y,Y,R,R,R,R,_,W,W,W,W,W,W,W,W,_,P],
  [_,_,W,W,W,W,W,W,W,W,_,B,B,B,B,B,B,B,B,B,W,W,W,W,W,W,W,W,_,R],
  [_,_,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,_,_],
  [_,_,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,_,_],
  [_,_,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,_,_],
  [_,_,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,_,_],
  [_,_,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,_,_],
  [_,_,W,W,W,W,W,K,K,K,W,W,W,W,W,W,W,W,W,W,K,K,K,W,W,W,W,W,_,_],
  [_,_,W,W,W,W,W,K,K,K,W,W,W,W,W,W,W,W,W,W,K,K,K,W,W,W,W,W,_,_],
  [_,_,W,W,W,W,W,K,K,K,W,W,W,W,W,R,R,W,W,W,K,K,K,W,W,W,W,W,_,_],
  [_,_,W,W,W,W,W,K,K,K,W,W,W,W,W,R,R,W,W,W,K,K,K,W,W,W,W,W,_,_],
  [_,_,W,W,W,W,W,K,K,K,W,W,W,W,W,R,R,W,W,W,K,K,K,W,W,W,W,W,_,_],
  [_,_,W,W,W,P,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,P,W,W,W,_,_],
  [_,_,W,W,W,W,P,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,P,W,W,W,W,_,_],
  [_,_,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,_,_],
];

export const PEEK_CHEERS_COSTUME = defineLook(
  'peek.costume.cheers',
  'cheers',
  'costume',
  ROWS,
  {
    label: 'cheers',
    summary: 'No-stroke PNG-mapped cheers costume with the source proportions preserved.',
    status: 'active',
    tags: ['costume', 'celebration'],
    palette: PEEK_LOOK_PALETTE,
    order: 325,
  },
);
