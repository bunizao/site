import {
  assertUniformFrames,
  assertUniformGrid,
  type MascotAsset,
  type MascotPreviewSection,
  type MascotRuntimeBehavior,
  type MascotSlot,
} from './model';
import { PEEK_BASE } from './base';
import { PEEK_LOOK_ASSETS } from './looks';
import { PEEK_MOTION_ASSETS } from './motions';
import { PEEK_POSE_ASSETS } from './poses';
import { PEEK_RUNTIME_BEHAVIORS, PEEK_SLOTS } from './slots';

const PEEK_ASSETS = [...PEEK_MOTION_ASSETS, ...PEEK_POSE_ASSETS, ...PEEK_LOOK_ASSETS] as const;

const PEEK_ASSET_MAP = new Map(PEEK_ASSETS.map((asset) => [asset.id, asset]));
const PEEK_SLOT_MAP = new Map(PEEK_SLOTS.map((slot) => [slot.id, slot]));

validatePeekCatalog();

export function getPeekBase() {
  return PEEK_BASE;
}

export function getPeekAsset(id: string): MascotAsset {
  const asset = PEEK_ASSET_MAP.get(id);
  if (!asset) {
    throw new Error(`Unknown peek asset: ${id}`);
  }
  return asset;
}

export function getPeekAssets(filter?: {
  kind?: MascotAsset['kind'];
  tags?: ReadonlyArray<string>;
  status?: MascotAsset['status'];
}): ReadonlyArray<MascotAsset> {
  return PEEK_ASSETS.filter((asset) => {
    if (filter?.kind && asset.kind !== filter.kind) return false;
    if (filter?.status && asset.status !== filter.status) return false;
    if (filter?.tags && !filter.tags.every((tag) => asset.tags.includes(tag))) return false;
    return true;
  });
}

export function getPeekSlot(id: string): MascotSlot {
  const slot = PEEK_SLOT_MAP.get(id);
  if (!slot) {
    throw new Error(`Unknown peek slot: ${id}`);
  }
  return slot;
}

export function getPeekSlotAsset(id: string): MascotAsset {
  return getPeekAsset(getPeekSlot(id).assetId);
}

export function getPeekSlotKey(id: string): string {
  return getPeekSlotAsset(id).key;
}

export function getPeekRuntimeBehaviors(): ReadonlyArray<
  MascotRuntimeBehavior & { animation: string; assetId: string }
> {
  return PEEK_RUNTIME_BEHAVIORS.map((behavior) => {
    const slot = getPeekSlot(behavior.slotId);
    const asset = getPeekAsset(slot.assetId);
    return {
      ...behavior,
      animation: asset.key,
      assetId: asset.id,
    };
  });
}

export function getPeekPreviewSections(): ReadonlyArray<MascotPreviewSection> {
  return [
    buildSection('core', 'Core Motions', 'The canonical emotional and idle motions that define peek as a character.', (asset) =>
      asset.kind === 'motion' && asset.tags.includes('core')),
    buildSection('nav', 'Navbar Triggers', 'States currently wired into the live site chrome, including aliases used by nav events.', (asset) =>
      (asset.kind === 'motion' || asset.kind === 'pose') && asset.tags.includes('nav')),
    buildSection('tracking', 'Tracking Poses', 'Directional poses and scan loops used when peek needs to follow or search.', (asset) =>
      (asset.kind === 'motion' || asset.kind === 'pose') && asset.tags.includes('tracking')),
    buildSection('utility', 'Utility Motions', 'One-shot transitions and special-purpose actions for entrances, exits, and alerts.', (asset) =>
      asset.kind === 'motion' && asset.tags.includes('utility')),
    buildSection('expressions', 'Added Expressions', 'Imported expression variants normalized into the same catalog as core motions.', (asset) =>
      asset.kind === 'expression'),
    buildSection('costumes', 'Added Costumes', 'Themed costume variants normalized into the same catalog as core motions.', (asset) =>
      asset.kind === 'costume'),
  ].filter((section) => section.items.length > 0);
}

export function getPeekTrackingPoseKeys(kind: 'preview' | 'not-found'): ReadonlyArray<string> {
  const prefix = kind === 'preview' ? 'preview.tracker' : 'not-found.tracker';
  const slotIds = [
    `${prefix}.far-left`,
    `${prefix}.left`,
    `${prefix}.center`,
    `${prefix}.right`,
    `${prefix}.far-right`,
  ];
  return slotIds.map((slotId) => getPeekSlotKey(slotId));
}

function buildSection(
  id: string,
  label: string,
  description: string,
  predicate: (asset: MascotAsset) => boolean,
): MascotPreviewSection {
  return {
    id,
    label,
    description,
    items: PEEK_ASSETS.filter(predicate).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
  };
}

function validatePeekCatalog(): void {
  const assetIds = new Set<string>();
  for (const asset of PEEK_ASSETS) {
    if (assetIds.has(asset.id)) {
      throw new Error(`Duplicate peek asset id: ${asset.id}`);
    }
    assetIds.add(asset.id);
    if (asset.grid) {
      assertUniformGrid(asset.grid, asset.id);
    }
    if (asset.frames) {
      assertUniformFrames(asset.frames, asset.id);
    }
    if (asset.aliasOf && !PEEK_ASSET_MAP.has(asset.aliasOf)) {
      throw new Error(`Alias target missing for ${asset.id}: ${asset.aliasOf}`);
    }
  }

  const slotIds = new Set<string>();
  for (const slot of PEEK_SLOTS) {
    if (slotIds.has(slot.id)) {
      throw new Error(`Duplicate peek slot id: ${slot.id}`);
    }
    slotIds.add(slot.id);
    if (!PEEK_ASSET_MAP.has(slot.assetId)) {
      throw new Error(`Peek slot references missing asset: ${slot.id} -> ${slot.assetId}`);
    }
    if (slot.fallbackAssetId && !PEEK_ASSET_MAP.has(slot.fallbackAssetId)) {
      throw new Error(`Peek slot fallback missing asset: ${slot.id} -> ${slot.fallbackAssetId}`);
    }
  }
}
