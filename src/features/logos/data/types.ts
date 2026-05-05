// Pixel logo data model.
// 0 = empty · 1 = body (foreground) · 2 = eye-hole (transparent through body) · 3 = accent
export type Cell = 0 | 1 | 2 | 3;
export type Grid = ReadonlyArray<ReadonlyArray<Cell>>;

export type Animation = {
  name: string;
  fps: number;
  frames: ReadonlyArray<Grid>;
  loop?: boolean;
};

export type LogoDefinition = {
  id: string;
  name: string;
  tagline: string;
  blurb: string;
  width: number;
  height: number;
  base: Grid;
  accent: string;
  animations: Record<string, Animation>;
};
