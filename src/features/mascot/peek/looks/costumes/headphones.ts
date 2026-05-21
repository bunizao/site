import { defineLook } from '../../model';
import { PEEK_LOOK_PALETTE } from '../../palette';
import { withBody } from './body';

const _ = 0;
const K = 8;

const HAT = [
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,K,K,K,K,K,K,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,K,K,K,K,K,K,K,K,K,K,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,K,K,K,_,_,_,_,_,_,_,_,K,K,K,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,K,K,K,_,_,_,_,_,_,_,_,_,_,_,_,K,K,K,_,_,_,_,_,_],
  [_,_,_,_,K,K,K,K,_,_,_,_,_,_,_,_,_,_,_,_,_,_,K,K,K,K,_,_,_,_],
  [_,_,_,K,K,K,K,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,K,K,K,K,_,_,_],
  [_,_,K,K,K,K,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,K,K,K,K,_,_],
  [_,K,K,K,K,K,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,K,K,K,K,K,_],
  [_,K,K,K,K,K,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,K,K,K,K,K,_],
  [_,K,K,K,K,K,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,K,K,K,K,K,_],
  [_,K,K,K,K,K,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,K,K,K,K,K,_],
  [_,K,K,K,K,K,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,K,K,K,K,K,_],
  [_,K,K,K,K,K,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,K,K,K,K,K,_],
];

const CUP_OVERLAY: ReadonlyArray<readonly [number, number, number]> = [
  ...range(15, 18).flatMap((y) => range(1, 6).map((x) => [x, y, K] as const)),
  ...range(15, 18).flatMap((y) => range(24, 29).map((x) => [x, y, K] as const)),
];

function range(start: number, end: number): number[] {
  const out: number[] = [];
  for (let i = start; i <= end; i += 1) out.push(i);
  return out;
}

export const PEEK_HEADPHONES_COSTUME = defineLook(
  'peek.costume.headphones',
  'headphones',
  'costume',
  withBody(HAT, CUP_OVERLAY),
  {
    label: 'headphones',
    summary: 'Cups over the ears with an arched headband. Useful for links to listening surfaces.',
    status: 'active',
    tags: ['costume'],
    palette: PEEK_LOOK_PALETTE,
    order: 350,
  },
);
