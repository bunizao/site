import { defineLook } from '../../model';
import { PEEK_LOOK_PALETTE } from '../../palette';
import { withBody } from './body';

const _ = 0;
const R = 4;
const Y = 6;
const K = 8;

const HAT = [
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,K,K,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,K,K,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,K,K,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,Y,Y,Y,Y,Y,Y,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,Y,R,R,R,R,R,R,Y,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,Y,R,R,Y,Y,Y,Y,R,R,Y,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,Y,R,Y,Y,Y,Y,Y,Y,R,Y,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,Y,R,Y,Y,Y,Y,Y,Y,R,Y,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,Y,R,Y,Y,Y,Y,Y,Y,R,Y,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,Y,R,Y,Y,Y,Y,Y,Y,R,Y,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,Y,R,R,Y,Y,Y,Y,R,R,Y,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,Y,R,R,R,R,R,R,Y,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,Y,Y,Y,Y,Y,Y,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,Y,Y,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,Y,Y,_,_,_,_,_],
];

export const PEEK_LANTERN_COSTUME = defineLook(
  'peek.costume.lantern',
  'lantern',
  'costume',
  withBody(HAT),
  {
    label: 'lantern',
    summary: 'Spring Festival variant. Red lantern with gold trim and tassel hanging beside the head.',
    status: 'active',
    tags: ['costume'],
    palette: PEEK_LOOK_PALETTE,
    order: 340,
  },
);
