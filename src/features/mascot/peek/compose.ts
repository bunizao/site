import {
  applyStamp,
  compileStamp,
  emptyGrid,
  isLayerSource,
  type LayerLike,
  type LayerSource,
} from './layer';
import {
  gridFromPattern,
  gridFromPatternRows,
  type Cell,
  type Grid,
} from './model';

export type Look = {
  readonly recolor?: Partial<Record<Cell, Cell>>;
  readonly overlay?: LayerSource;
};

export function compose(base: Grid, ...layers: ReadonlyArray<LayerLike | undefined>): Grid {
  const height = base.length;
  const width = base[0]?.length ?? 0;
  let current: Grid = base.map((row) => row.slice() as Cell[]);
  for (const layer of layers) {
    if (!layer) continue;
    current = stack(current, layer, width, height);
  }
  return current;
}

export function applyLook(grid: Grid, look: Look | undefined): Grid {
  if (!look) return grid;
  let out: Grid = grid;
  if (look.recolor) {
    out = grid.map((row) => row.map((cell) => (look.recolor![cell] ?? cell) as Cell));
  }
  if (look.overlay) {
    out = compose(out, look.overlay);
  }
  return out;
}

export function resolveLayer(layer: LayerLike, width: number, height: number): Grid {
  return stack(emptyGrid(width, height), layer, width, height);
}

function stack(base: Grid, layer: LayerLike, width: number, height: number): Grid {
  if (typeof layer === 'string') {
    const grid = layer.includes('|') ? gridFromPattern(layer) : gridFromPatternRows([layer]);
    if (grid.length !== height || (grid[0]?.length ?? 0) !== width) {
      throw new Error(
        `string layer dimensions ${grid[0]?.length ?? 0}x${grid.length} do not match ${width}x${height}`,
      );
    }
    return grid.map((row, y) => row.map((c, x) => (c === 0 ? base[y]![x]! : c)) as Cell[]);
  }
  if (isLayerSource(layer)) {
    return applyStamp(base, compileStamp(layer, width, height));
  }
  if (layer.length !== height || (layer[0]?.length ?? 0) !== width) {
    throw new Error(
      `grid layer dimensions ${layer[0]?.length ?? 0}x${layer.length} do not match ${width}x${height}`,
    );
  }
  return layer.map((row) => row.slice() as Cell[]);
}
