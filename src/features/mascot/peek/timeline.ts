import { compose } from './compose';
import type { Grid, MascotAsset, MascotFrameBeat } from './model';
import { defineMotion } from './model';
import type { LayerLike } from './layer';

export type MascotFrame = {
  id: string;
  grid: Grid;
};

export function frame(id: string, grid: Grid): MascotFrame {
  return { id, grid };
}

export function composeFrame(
  id: string,
  base: Grid,
  ...layers: ReadonlyArray<LayerLike | undefined>
): MascotFrame {
  return frame(id, compose(base, ...layers));
}

export function beat(frameIndex: number, holdFrames = 1, label?: string): MascotFrameBeat {
  return {
    frame: frameIndex,
    holdFrames,
    ...(label ? { label } : {}),
  };
}

export function beatMs(frameIndex: number, holdMs: number, label?: string): MascotFrameBeat {
  return {
    frame: frameIndex,
    holdMs,
    ...(label ? { label } : {}),
  };
}

export function defineTimelineMotion(
  id: string,
  key: string,
  fps: number,
  frames: ReadonlyArray<MascotFrame>,
  timeline: ReadonlyArray<MascotFrameBeat>,
  meta: Omit<MascotAsset, 'id' | 'mascot' | 'key' | 'kind' | 'frames' | 'frameLabels' | 'timeline' | 'fps'>,
): MascotAsset {
  return defineMotion(id, key, fps, frames.map((item) => item.grid), {
    ...meta,
    frameLabels: frames.map((item) => item.id),
    timeline,
  });
}

export function expandTimelineFrames(asset: MascotAsset): ReadonlyArray<Grid> {
  if (!asset.timeline || !asset.frames) {
    return asset.frames ?? (asset.grid ? [asset.grid] : []);
  }

  const fps = asset.fps ?? 1;
  return asset.timeline.flatMap((item) => {
    const grid = asset.frames?.[item.frame];
    if (!grid) return [];
    const holdFrames = item.holdFrames ?? Math.max(1, Math.round(((item.holdMs ?? 0) / 1000) * fps));
    return Array.from({ length: holdFrames }, () => grid);
  });
}
