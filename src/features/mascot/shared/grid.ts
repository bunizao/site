import type { Cell, Grid } from './types';

const PATTERN_TO_CELL: Record<string, Cell> = {
  '.': 0,
  '#': 1,
  o: 2,
  '*': 3,
};

export function gridFromPatternRows(rows: ReadonlyArray<string>): Grid {
  return rows.map((row) =>
    row.split('').map((cell) => PATTERN_TO_CELL[cell] ?? 0),
  ) as Grid;
}

export function gridFromPattern(pattern: string): Grid {
  return gridFromPatternRows(pattern.split('|'));
}

export function gridsFromPatterns(patterns: ReadonlyArray<string>): ReadonlyArray<Grid> {
  return patterns.map(gridFromPattern);
}

export function gridFromNumericRows(rows: ReadonlyArray<ReadonlyArray<number>>): Grid {
  return rows.map((row) => row.map((cell) => cell as Cell)) as Grid;
}

export function getGridDimensions(grid: Grid): { width: number; height: number } {
  return { width: grid[0]?.length ?? 0, height: grid.length };
}

export function assertUniformGrid(grid: Grid, label: string): void {
  const width = grid[0]?.length ?? 0;
  grid.forEach((row, index) => {
    if (row.length !== width) {
      throw new Error(`${label} has non-uniform row width at row ${index}`);
    }
  });
}

export function assertUniformFrames(frames: ReadonlyArray<Grid>, label: string): void {
  if (frames.length === 0) {
    throw new Error(`${label} has no frames`);
  }
  frames.forEach((frame, index) => assertUniformGrid(frame, `${label} frame ${index}`));
  const first = getGridDimensions(frames[0]);
  frames.forEach((frame, index) => {
    const size = getGridDimensions(frame);
    if (size.width !== first.width || size.height !== first.height) {
      throw new Error(`${label} frame ${index} does not match frame 0 dimensions`);
    }
  });
}
