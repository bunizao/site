export type Cell = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type Grid = ReadonlyArray<ReadonlyArray<Cell>>;
export type CellPalette = Partial<Record<Cell, string>>;

export type MascotAssetKind = 'motion' | 'pose' | 'expression' | 'costume';
export type MascotAssetStatus = 'active' | 'draft' | 'archived';
export type MascotMotionKind = 'loop' | 'one-shot' | 'pose' | 'alias';

export type MascotIdentity = {
  id: string;
  name: string;
  tagline: string;
  blurb: string;
  width: number;
  height: number;
  base: Grid;
  accent: string;
};

export type MascotAsset = {
  id: string;
  mascot: 'peek';
  key: string;
  kind: MascotAssetKind;
  label: string;
  summary: string;
  status: MascotAssetStatus;
  tags: ReadonlyArray<string>;
  grid?: Grid;
  frames?: ReadonlyArray<Grid>;
  fps?: number;
  loop?: boolean;
  motionKind?: MascotMotionKind;
  aliasOf?: string;
  previewLoop?: boolean;
  usage?: string;
  palette?: CellPalette;
  order?: number;
};

export type MascotSlot = {
  id: string;
  label: string;
  assetId: string;
  fallbackAssetId?: string;
  eventChannel?: string;
  holdMs?: number;
  notes?: string;
};

export type MascotRuntimeBehavior = {
  slotId: string;
  label: string;
  description: string;
};

export type MascotPreviewSection = {
  id: string;
  label: string;
  description: string;
  items: ReadonlyArray<MascotAsset>;
};

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

export function defineMotion(
  id: string,
  key: string,
  fps: number,
  frames: ReadonlyArray<string>,
  meta: Omit<MascotAsset, 'id' | 'mascot' | 'key' | 'kind' | 'frames' | 'fps'>,
): MascotAsset {
  return {
    id,
    mascot: 'peek',
    key,
    kind: 'motion',
    fps,
    frames: gridsFromPatterns(frames),
    ...meta,
  };
}

export function definePose(
  id: string,
  key: string,
  frame: string | Grid,
  meta: Omit<MascotAsset, 'id' | 'mascot' | 'key' | 'kind' | 'grid'>,
): MascotAsset {
  return {
    id,
    mascot: 'peek',
    key,
    kind: 'pose',
    grid: typeof frame === 'string' ? gridFromPattern(frame) : frame,
    ...meta,
  };
}

export function defineLook(
  id: string,
  key: string,
  kind: 'expression' | 'costume',
  rows: ReadonlyArray<ReadonlyArray<number>>,
  meta: Omit<MascotAsset, 'id' | 'mascot' | 'key' | 'kind' | 'grid'>,
): MascotAsset {
  return {
    id,
    mascot: 'peek',
    key,
    kind,
    grid: gridFromNumericRows(rows),
    ...meta,
  };
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
  const width = frames[0]?.[0]?.length ?? 0;
  const height = frames[0]?.length ?? 0;
  frames.forEach((frame, index) => {
    if (frame.length !== height || (frame[0]?.length ?? 0) !== width) {
      throw new Error(`${label} frame ${index} does not match frame 0 dimensions`);
    }
  });
}
