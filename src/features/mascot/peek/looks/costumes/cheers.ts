import { defineLook } from '../../model';
import { PEEK_LOOK_PALETTE } from '../../palette';
import { withBody } from './body';

const _ = 0;
const R = 4;
const Y = 6;
const B = 11;
const P = 12;

const HAT = [
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,B,B,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,B,B,B,B,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,B,B,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,Y,Y,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,Y,Y,Y,Y,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,R,R,R,Y,Y,Y,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,R,R,R,Y,Y,Y,R,R,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,R,R,Y,Y,Y,R,R,R,R,R,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,Y,Y,Y,R,R,R,R,Y,Y,Y,Y,Y,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,Y,Y,R,R,R,R,Y,Y,Y,Y,R,R,R,R,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,R,R,R,R,Y,Y,Y,Y,R,R,R,R,Y,Y,Y,Y,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,Y,Y,Y,Y,R,R,R,R,Y,Y,Y,Y,R,R,R,R,R,R,_,_,_,_,_],
  [_,_,_,_,_,_,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,_,_,_,_],
  [_,_,_,_,_,_,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,_,_,_,_],
  [_,_,_,_,_,_,_,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,_,_,_,_,_],
];

export const PEEK_CHEERS_COSTUME = defineLook(
  'peek.costume.cheers',
  'cheers',
  'costume',
  withBody(HAT, [
    [3, 30, P],
    [4, 31, P],
    [26, 30, P],
    [25, 31, P],
  ]),
  {
    label: 'cheers',
    summary: 'No-stroke party redraw with a striped cone hat, blue topper, blue band, and small cheek pixels.',
    status: 'active',
    tags: ['costume', 'celebration'],
    palette: PEEK_LOOK_PALETTE,
    order: 325,
  },
);
