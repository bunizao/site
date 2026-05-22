import { defineLook } from '../../model';
import { PEEK_LOOK_PALETTE } from '../../palette';
import { withBody } from './body';

const _ = 0;
const R = 4;
const W = 5;

const HAT = [
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,W,W,W,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,W,W,W,W,W,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,W,W,W,W,W,W,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,W,W,W,W,W,W,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,R,R,R,W,W,W,W,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,R,R,R,R,R,W,W,W,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,R,R,R,R,R,R,R,W,W,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,R,R,R,R,R,R,R,R,R,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,R,R,R,R,R,R,R,R,R,R,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,R,R,R,R,R,R,R,R,R,R,R,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,R,R,R,R,R,R,R,R,R,R,R,R,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,R,R,R,R,R,R,R,R,R,R,R,R,R,_,_,_,_],
  [_,_,_,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,_,_,_],
  [_,_,_,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,_,_,_],
  [_,_,_,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,_,_,_],
];

export const PEEK_SANTA_COSTUME = defineLook(
  'peek.costume.santa',
  'santa',
  'costume',
  withBody(HAT),
  {
    label: 'santa',
    summary: 'December takeover. Floppy red hat with white pom and full fur band.',
    status: 'active',
    tags: ['costume'],
    palette: PEEK_LOOK_PALETTE,
    order: 310,
  },
);
