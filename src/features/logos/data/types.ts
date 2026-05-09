// Pixel logo data model.
// 0 = empty · 1 = body (foreground) · 2 = eye-hole (transparent through body) · 3 = accent
export type Cell = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type Grid = ReadonlyArray<ReadonlyArray<Cell>>;

export type PeekLookKind = 'expression' | 'costume';

export type PeekLookDefinition = {
  kind: PeekLookKind;
  label: string;
  blurb: string;
  grid: Grid;
};

export type Animation = {
  name: string;
  fps: number;
  frames: ReadonlyArray<Grid>;
  loop?: boolean;
  label?: string;
  summary?: string;
  usage?: string;
  kind?: 'loop' | 'one-shot' | 'pose' | 'alias';
  aliasOf?: string;
  previewLoop?: boolean;
  tags?: ReadonlyArray<string>;
};

export type LogoGallerySection = {
  id: string;
  label: string;
  description: string;
  items: ReadonlyArray<string>;
};

export type LogoRuntimeBehavior = {
  label: string;
  animation: string;
  description: string;
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
  gallery?: ReadonlyArray<LogoGallerySection>;
  runtimeBehaviors?: ReadonlyArray<LogoRuntimeBehavior>;
};
