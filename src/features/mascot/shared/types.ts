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
