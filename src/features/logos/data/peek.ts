import {
  getPeekAssets,
  getPeekBase,
  getPeekPreviewSections,
  getPeekRuntimeBehaviors,
} from '@/features/mascot/peek/catalog';
import type { Animation, LogoDefinition } from './types';

function toLegacyAnimation(name: string, asset: ReturnType<typeof getPeekAssets>[number]): Animation {
  return {
    name,
    fps: asset.fps ?? 1,
    frames: asset.frames ?? (asset.grid ? [asset.grid] : []),
    frameLabels: asset.frameLabels,
    timeline: asset.timeline,
    loop: asset.loop,
    label: asset.label,
    summary: asset.summary,
    usage: asset.usage,
    kind: asset.motionKind,
    aliasOf: asset.aliasOf ? asset.aliasOf.split('.').at(-1) : undefined,
    previewLoop: asset.previewLoop,
    tags: asset.tags,
  };
}

const base = getPeekBase();
const legacyAnimationAssets = getPeekAssets().filter(
  (asset) => asset.kind === 'motion' || asset.kind === 'pose',
);

const animations = Object.fromEntries(
  legacyAnimationAssets.map((asset) => [asset.key, toLegacyAnimation(asset.key, asset)]),
);

const gallery = getPeekPreviewSections()
  .filter((section) => section.items.some((item) => item.kind === 'motion' || item.kind === 'pose'))
  .map((section) => ({
    id: section.id,
    label: section.label,
    description: section.description,
    items: section.items
      .filter((item) => item.kind === 'motion' || item.kind === 'pose')
      .map((item) => item.key),
  }));

const runtimeBehaviors = getPeekRuntimeBehaviors().map((behavior) => ({
  label: behavior.label,
  animation: behavior.animation,
  description: behavior.description,
}));

export const PEEK: LogoDefinition = {
  id: base.id,
  name: base.name,
  tagline: base.tagline,
  blurb: base.blurb,
  width: base.width,
  height: base.height,
  base: base.base,
  accent: base.accent,
  animations,
  gallery,
  runtimeBehaviors,
};
