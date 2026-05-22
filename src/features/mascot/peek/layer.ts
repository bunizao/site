import {
  gridFromPatternRows,
  type Cell,
  type Grid,
} from './model';

export type SparseCell = Cell | -1;

export type SparsePixel = readonly [x: number, y: number, c: SparseCell];

export type RleRun = readonly [cell: Cell, count: number];

export type LayerSource =
  | { readonly kind: 'sparse'; readonly pixels: ReadonlyArray<SparsePixel> }
  | { readonly kind: 'rows'; readonly rows: ReadonlyArray<string> }
  | {
      readonly kind: 'rle';
      readonly width: number;
      readonly height: number;
      readonly rle: ReadonlyArray<ReadonlyArray<RleRun>>;
    };

export type LayerLike = string | Grid | LayerSource;

type Stamp = ReadonlyArray<ReadonlyArray<SparseCell | undefined>>;

export function sparse(pixels: ReadonlyArray<SparsePixel>): LayerSource {
  return { kind: 'sparse', pixels };
}

export function rows(rows: ReadonlyArray<string>): LayerSource {
  return { kind: 'rows', rows };
}

export function rle(
  width: number,
  height: number,
  rle: ReadonlyArray<ReadonlyArray<RleRun>>,
): LayerSource {
  return { kind: 'rle', width, height, rle };
}

export function isLayerSource(value: unknown): value is LayerSource {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    typeof (value as { kind: unknown }).kind === 'string'
  );
}

export function compileStamp(source: LayerSource, width: number, height: number): Stamp {
  switch (source.kind) {
    case 'sparse':
      return stampFromSparse(source.pixels, width, height);
    case 'rows':
      return stampFromRows(source.rows, width, height);
    case 'rle':
      return stampFromRle(source, width, height);
  }
}

export function applyStamp(base: ReadonlyArray<ReadonlyArray<Cell>>, stamp: Stamp): Grid {
  const height = base.length;
  const width = base[0]?.length ?? 0;
  const out: Cell[][] = base.map((row) => row.slice() as Cell[]);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = stamp[y]?.[x];
      if (value === undefined) continue;
      out[y]![x] = value === -1 ? 0 : (value as Cell);
    }
  }
  return out;
}

export function compileLayerOnto(base: Grid, source: LayerSource): Grid {
  const height = base.length;
  const width = base[0]?.length ?? 0;
  const stamp = compileStamp(source, width, height);
  return applyStamp(base, stamp);
}

export function emptyGrid(width: number, height: number): Grid {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => 0 as Cell));
}

function stampFromSparse(
  pixels: ReadonlyArray<SparsePixel>,
  width: number,
  height: number,
): Stamp {
  const stamp: Array<Array<SparseCell | undefined>> = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => undefined),
  );
  for (const [x, y, c] of pixels) {
    if (x < 0 || x >= width || y < 0 || y >= height) {
      throw new Error(`sparse pixel out of bounds: [${x}, ${y}] for ${width}x${height}`);
    }
    stamp[y]![x] = c;
  }
  return stamp;
}

function stampFromRows(
  rowsInput: ReadonlyArray<string>,
  width: number,
  height: number,
): Stamp {
  if (rowsInput.length !== height) {
    throw new Error(`rows layer height ${rowsInput.length} does not match expected ${height}`);
  }
  const grid = gridFromPatternRows(rowsInput);
  return grid.map((row, y) => {
    if (row.length !== width) {
      throw new Error(`rows layer width ${row.length} at row ${y} does not match expected ${width}`);
    }
    return row.slice();
  });
}

function stampFromRle(
  source: { width: number; height: number; rle: ReadonlyArray<ReadonlyArray<RleRun>> },
  width: number,
  height: number,
): Stamp {
  if (source.width !== width || source.height !== height) {
    throw new Error(`rle layer ${source.width}x${source.height} does not match expected ${width}x${height}`);
  }
  if (source.rle.length !== height) {
    throw new Error(`rle layer has ${source.rle.length} rows, expected ${height}`);
  }
  return source.rle.map((row, y) => {
    const out: SparseCell[] = [];
    for (const [cell, count] of row) {
      for (let i = 0; i < count; i += 1) out.push(cell);
    }
    if (out.length !== width) {
      throw new Error(`rle layer row ${y} expands to ${out.length} cells, expected ${width}`);
    }
    return out;
  });
}
