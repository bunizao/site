import type { Cell, Grid, MascotFrameBeat } from '@/features/mascot/peek/model';

export type { Cell, Grid };

export type Animation = {
  name: string;
  fps: number;
  frames: ReadonlyArray<Grid>;
  frameLabels?: ReadonlyArray<string>;
  timeline?: ReadonlyArray<MascotFrameBeat>;
  loop?: boolean;
  label?: string;
  summary?: string;
  usage?: string;
  kind?: 'loop' | 'one-shot' | 'pose' | 'alias';
  aliasOf?: string;
  previewLoop?: boolean;
  tags?: ReadonlyArray<string>;
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

export type LogoRuntimeAnimation = Pick<Animation, 'fps' | 'frames' | 'loop' | 'frameLabels' | 'timeline'>;

export type LogoRuntimeDefinition = Pick<LogoDefinition, 'width' | 'height' | 'base' | 'accent'> & {
  animations: Record<string, LogoRuntimeAnimation>;
};
