import { defineLook } from '../../model';
import { PEEK_LOOK_PALETTE } from '../../palette';
import { withBody } from './body';

const _ = 0;
const B = 10;
const Y = 6;

const HAT = [
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,Y,Y,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,Y,Y,Y,Y,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,Y,Y,Y,Y,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,Y,Y,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,Y,Y,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,Y,Y,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,Y,Y,Y,Y,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B],
  [B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B],
  [_,_,_,_,_,_,_,_,B,B,B,B,B,B,B,B,B,B,B,B,B,B,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,B,B,B,B,B,B,B,B,B,B,B,B,_,_,_,_,_,_,_,_,_],
];

export const PEEK_GRADUATE_COSTUME = defineLook(
  'peek.costume.graduate',
  'graduate',
  'costume',
  withBody(HAT),
  {
    label: 'graduate',
    summary: 'Mortarboard with a center gold tassel and bell. Useful for finished-course or milestone pages.',
    status: 'active',
    tags: ['costume'],
    palette: PEEK_LOOK_PALETTE,
    order: 370,
  },
);
