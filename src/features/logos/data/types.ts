import type { Cell, Grid } from '@/features/mascot/peek/model';

export type { Cell, Grid };

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
