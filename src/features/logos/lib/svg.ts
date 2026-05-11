import type { LogoDefinition } from '../data/types';
import { TUTU } from '../data/tutu';
import { PEEK_STATIC } from '../data/peek-static';
import { gridToSvg, type RenderOptions } from './render';

export { gridToSvg, paletteGridToSvg, type PaletteRenderOptions, type RenderOptions } from './render';

export const LOGOS = { tutu: TUTU, peek: PEEK_STATIC } as const;
export type LogoId = keyof typeof LOGOS;

export function getLogo(id: LogoId): LogoDefinition {
  return LOGOS[id];
}

export function logoToSvg(id: LogoId, opts: RenderOptions = {}): string {
  const def = getLogo(id);
  const accent = opts.accent ?? def.accent;
  return gridToSvg(def.base, def.width, def.height, { ...opts, accent });
}
