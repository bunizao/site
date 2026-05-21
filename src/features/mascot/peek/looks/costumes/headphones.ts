import { defineLook } from '../../model';
import { PEEK_LOOK_PALETTE } from '../../palette';
import { withBody } from './body';

const _ = 0;
const W = 5;
const K = 8;

const HAT = [
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,W,W,W,W,W,W,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,W,W,W,K,K,K,K,W,W,W,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,W,W,W,K,K,K,K,K,K,K,K,W,W,W,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,W,W,W,K,K,K,K,K,K,K,K,K,K,K,K,W,W,W,_,_,_,_,_,_],
  [_,_,_,_,W,W,W,K,K,K,K,K,K,K,K,K,K,K,K,K,K,K,K,W,W,W,_,_,_,_],
  [_,_,_,W,W,K,K,K,K,K,K,K,K,K,K,K,K,K,K,K,K,K,K,K,K,W,W,_,_,_],
  [_,_,W,W,K,K,K,K,_,_,_,_,_,_,_,_,_,_,_,_,_,_,K,K,K,K,W,W,_,_],
  [_,W,W,K,K,K,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,K,K,K,W,W,_],
  [_,W,W,K,K,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,K,K,W,W,_],
  [_,W,W,K,K,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,K,K,W,W,_],
  [_,W,W,K,K,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,K,K,W,W,_],
  [_,W,W,K,K,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,K,K,W,W,_],
  [_,W,W,W,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,W,W,W,_],
];

export const PEEK_HEADPHONES_COSTUME = defineLook(
  'peek.costume.headphones',
  'headphones',
  'costume',
  withBody(HAT),
  {
    label: 'headphones',
    summary: 'White headband arching over the head with dark cups flanking the ears.',
    status: 'active',
    tags: ['costume'],
    palette: PEEK_LOOK_PALETTE,
    order: 350,
  },
);
