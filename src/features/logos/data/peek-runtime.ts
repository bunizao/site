import { PEEK_BASE } from '@/features/mascot/peek/base';
import type { MascotAsset, MascotSlot } from '@/features/mascot/peek/model';
import { PEEK_ALERT_MOTION } from '@/features/mascot/peek/motions/alert';
import { PEEK_CURIOUS_MOTION } from '@/features/mascot/peek/motions/curious';
import { PEEK_DART_MOTION } from '@/features/mascot/peek/motions/dart';
import { PEEK_DISSOLVE_MOTION } from '@/features/mascot/peek/motions/dissolve';
import { PEEK_IDLE_MOTION } from '@/features/mascot/peek/motions/idle';
import { PEEK_NAP_MOTION } from '@/features/mascot/peek/motions/nap';
import { PEEK_PURR_MOTION } from '@/features/mascot/peek/motions/purr';
import { PEEK_SCAN_MOTION } from '@/features/mascot/peek/motions/scan';
import { PEEK_TRACK_CENTER_POSE } from '@/features/mascot/peek/poses/track-center';
import { PEEK_TRACK_FAR_LEFT_POSE } from '@/features/mascot/peek/poses/track-far-left';
import { PEEK_TRACK_FAR_RIGHT_POSE } from '@/features/mascot/peek/poses/track-far-right';
import { PEEK_TRACK_LEFT_POSE } from '@/features/mascot/peek/poses/track-left';
import { PEEK_TRACK_RIGHT_POSE } from '@/features/mascot/peek/poses/track-right';
import { PEEK_SLOTS } from '@/features/mascot/peek/slots';
import type { LogoRuntimeAnimation, LogoRuntimeDefinition } from './types';

const PEEK_HAPPY_ANIMATION: LogoRuntimeAnimation = toAnimation(PEEK_PURR_MOTION);
const PEEK_SLEEPY_ANIMATION: LogoRuntimeAnimation = {
  ...toAnimation(PEEK_NAP_MOTION),
  fps: 4,
};

const PEEK_RUNTIME_ANIMATIONS: Record<string, LogoRuntimeAnimation> = {
  idle: toAnimation(PEEK_IDLE_MOTION),
  dart: toAnimation(PEEK_DART_MOTION),
  curious: toAnimation(PEEK_CURIOUS_MOTION),
  happy: PEEK_HAPPY_ANIMATION,
  sleepy: PEEK_SLEEPY_ANIMATION,
  scan: toAnimation(PEEK_SCAN_MOTION),
  alert: toAnimation(PEEK_ALERT_MOTION),
  dissolve: toAnimation(PEEK_DISSOLVE_MOTION),
  track_far_left: toAnimation(PEEK_TRACK_FAR_LEFT_POSE),
  track_left: toAnimation(PEEK_TRACK_LEFT_POSE),
  track_center: toAnimation(PEEK_TRACK_CENTER_POSE),
  track_right: toAnimation(PEEK_TRACK_RIGHT_POSE),
  track_far_right: toAnimation(PEEK_TRACK_FAR_RIGHT_POSE),
};

const PEEK_RUNTIME_ASSET_KEYS = new Map([
  [PEEK_IDLE_MOTION.id, 'idle'],
  [PEEK_DART_MOTION.id, 'dart'],
  [PEEK_CURIOUS_MOTION.id, 'curious'],
  ['peek.motion.happy', 'happy'],
  ['peek.motion.sleepy', 'sleepy'],
  [PEEK_SCAN_MOTION.id, 'scan'],
  [PEEK_ALERT_MOTION.id, 'alert'],
  [PEEK_DISSOLVE_MOTION.id, 'dissolve'],
  [PEEK_TRACK_FAR_LEFT_POSE.id, 'track_far_left'],
  [PEEK_TRACK_LEFT_POSE.id, 'track_left'],
  [PEEK_TRACK_CENTER_POSE.id, 'track_center'],
  [PEEK_TRACK_RIGHT_POSE.id, 'track_right'],
  [PEEK_TRACK_FAR_RIGHT_POSE.id, 'track_far_right'],
]);

const NAVBAR_ANIMATION_KEYS = ['idle', 'dart', 'curious', 'happy', 'sleepy'] as const;
const NOT_FOUND_ANIMATION_KEYS = [
  'scan',
  'track_far_left',
  'track_left',
  'track_center',
  'track_right',
  'track_far_right',
  'alert',
  'dissolve',
] as const;
const PREVIEW_TRACKER_ANIMATION_KEYS = [
  'scan',
  'track_far_left',
  'track_left',
  'track_center',
  'track_right',
  'track_far_right',
] as const;

export const PEEK_NAVBAR_LOGO = createPeekLogoFromAnimations(pickAnimations(NAVBAR_ANIMATION_KEYS));
export const PEEK_NOT_FOUND_LOGO = createPeekLogoFromAnimations(pickAnimations(NOT_FOUND_ANIMATION_KEYS));
export const PEEK_PREVIEW_TRACKER_LOGO = createPeekLogoFromAnimations(
  pickAnimations(PREVIEW_TRACKER_ANIMATION_KEYS),
);

export function createPeekLogoFromAssets(assets: ReadonlyArray<MascotAsset>): LogoRuntimeDefinition {
  return createPeekLogoFromAnimations(
    Object.fromEntries(assets.map((asset) => [asset.key, toAnimation(asset)])),
  );
}

export function getPeekRuntimeSlot(id: string): MascotSlot {
  const slot = PEEK_SLOTS.find((item) => item.id === id);
  if (!slot) {
    throw new Error(`Unknown peek slot: ${id}`);
  }
  return slot;
}

export function getPeekRuntimeSlotKey(id: string): string {
  const slot = getPeekRuntimeSlot(id);
  const key = PEEK_RUNTIME_ASSET_KEYS.get(slot.assetId);
  if (!key) {
    throw new Error(`Peek slot is not available in the runtime logo: ${id}`);
  }
  return key;
}

export function getPeekRuntimeTrackingPoseKeys(kind: 'preview' | 'not-found'): ReadonlyArray<string> {
  const prefix = kind === 'preview' ? 'preview.tracker' : 'not-found.tracker';
  return [
    `${prefix}.far-left`,
    `${prefix}.left`,
    `${prefix}.center`,
    `${prefix}.right`,
    `${prefix}.far-right`,
  ].map((slotId) => getPeekRuntimeSlotKey(slotId));
}

function toAnimation(asset: MascotAsset): LogoRuntimeAnimation {
  return {
    fps: asset.fps ?? 1,
    frames: asset.frames ?? (asset.grid ? [asset.grid] : []),
    frameLabels: asset.frameLabels,
    timeline: asset.timeline,
    loop: asset.loop,
  };
}

function pickAnimations(keys: ReadonlyArray<string>): Record<string, LogoRuntimeAnimation> {
  return Object.fromEntries(keys.map((key) => [key, PEEK_RUNTIME_ANIMATIONS[key]]));
}

function createPeekLogoFromAnimations(animations: Record<string, LogoRuntimeAnimation>): LogoRuntimeDefinition {
  return {
    width: PEEK_BASE.width,
    height: PEEK_BASE.height,
    base: PEEK_BASE.base,
    accent: PEEK_BASE.accent,
    animations,
  };
}
