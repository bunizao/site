export const COSTUME_WIDTH = 30;
export const COSTUME_HAT_HEIGHT = 15;
export const COSTUME_BODY_HEIGHT = 21;
export const COSTUME_HEIGHT = COSTUME_HAT_HEIGHT + COSTUME_BODY_HEIGHT;

const _ = 0;
const F = 1;
const E = 2;
const M = 3;

export const COSTUME_BODY_ROWS: ReadonlyArray<ReadonlyArray<number>> = [
  [_,_,_,F,F,F,F,F,F,_,_,_,_,_,_,_,_,_,_,_,_,F,F,F,F,F,F,_,_,_],
  [_,_,_,F,F,F,F,F,F,_,_,_,_,_,_,_,_,_,_,_,_,F,F,F,F,F,F,_,_,_],
  [_,_,_,F,F,F,F,F,F,_,_,_,_,_,_,_,_,_,_,_,_,F,F,F,F,F,F,_,_,_],
  [F,F,F,F,F,F,F,F,F,_,_,_,_,_,_,_,_,_,_,_,_,F,F,F,F,F,F,F,F,F],
  [F,F,F,F,F,F,F,F,F,_,_,_,_,_,_,_,_,_,_,_,_,F,F,F,F,F,F,F,F,F],
  [F,F,F,F,F,F,F,F,F,_,_,_,_,_,_,_,_,_,_,_,_,F,F,F,F,F,F,F,F,F],
  [F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F],
  [F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F],
  [F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F],
  [F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F],
  [F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F],
  [F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F],
  [F,F,F,F,F,F,E,E,E,F,F,F,F,F,F,F,F,F,F,F,F,E,E,E,F,F,F,F,F,F],
  [F,F,F,F,F,F,E,E,E,F,F,F,F,F,F,F,F,F,F,F,F,E,E,E,F,F,F,F,F,F],
  [F,F,F,F,F,F,E,E,E,F,F,F,F,F,F,F,F,F,F,F,F,E,E,E,F,F,F,F,F,F],
  [F,F,F,F,F,F,E,E,E,F,F,F,F,F,F,M,M,M,F,F,F,E,E,E,F,F,F,F,F,F],
  [F,F,F,F,F,F,E,E,E,F,F,F,F,F,F,M,M,M,F,F,F,E,E,E,F,F,F,F,F,F],
  [F,F,F,F,F,F,E,E,E,F,F,F,F,F,F,M,M,M,F,F,F,E,E,E,F,F,F,F,F,F],
  [F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F],
  [F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F],
  [F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F],
];

export function withBody(
  hat: ReadonlyArray<ReadonlyArray<number>>,
  overlay?: ReadonlyArray<readonly [x: number, y: number, c: number]>,
): ReadonlyArray<ReadonlyArray<number>> {
  if (hat.length !== COSTUME_HAT_HEIGHT) {
    throw new Error(`costume hat must be ${COSTUME_HAT_HEIGHT} rows, got ${hat.length}`);
  }
  for (let i = 0; i < hat.length; i += 1) {
    if (hat[i]!.length !== COSTUME_WIDTH) {
      throw new Error(`costume hat row ${i} must be ${COSTUME_WIDTH} cells, got ${hat[i]!.length}`);
    }
  }
  const grid: number[][] = [
    ...hat.map((row) => [...row]),
    ...COSTUME_BODY_ROWS.map((row) => [...row]),
  ];
  if (overlay) {
    for (const [x, y, c] of overlay) {
      if (y < 0 || y >= COSTUME_HEIGHT || x < 0 || x >= COSTUME_WIDTH) {
        throw new Error(`costume overlay pixel out of bounds: [${x}, ${y}]`);
      }
      grid[y]![x] = c;
    }
  }
  return grid;
}
