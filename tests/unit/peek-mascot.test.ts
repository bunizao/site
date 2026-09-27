import { describe, expect, test } from 'bun:test';
import {
  getPeekAsset,
  getPeekRuntimeBehaviors,
  getPeekSlot,
  getPeekSlotKey,
  getPeekTrackingPoseKeys,
} from '../../src/features/mascot/peek/catalog';
import { expandTimelineFrames } from '../../src/features/mascot/peek/timeline';

describe('peek mascot catalog', () => {
  test('every runtime slot resolves to its intended animation and asset', () => {
    expect(
      getPeekRuntimeBehaviors().map(({ slotId, animation, assetId }) => ({ slotId, animation, assetId }))
    ).toEqual([
      { slotId: 'navbar.brand.default', animation: 'idle', assetId: 'peek.motion.idle' },
      { slotId: 'navbar.brand.hover', animation: 'dart', assetId: 'peek.motion.dart' },
      { slotId: 'navbar.nav-link.hover', animation: 'curious', assetId: 'peek.motion.curious' },
      { slotId: 'navbar.section.active', animation: 'happy', assetId: 'peek.motion.happy' },
      { slotId: 'navbar.idle-timeout', animation: 'sleepy', assetId: 'peek.motion.sleepy' },
    ]);
    expect(getPeekSlot('navbar.section.active').holdMs).toBe(600);
    expect(getPeekSlotKey('not-found.tracker.default')).toBe('scan');
  });

  test('keeps tracking poses in deterministic left-to-right order', () => {
    expect(getPeekTrackingPoseKeys('preview')).toEqual([
      'track_far_left',
      'track_left',
      'track_center',
      'track_right',
      'track_far_right',
    ]);

    expect(getPeekTrackingPoseKeys('not-found')).toEqual([
      'track_far_left',
      'track_left',
      'track_center',
      'track_right',
      'track_far_right',
    ]);
  });

  test('models repeated motion with timeline beats instead of duplicated source frames', () => {
    const idle = getPeekAsset('peek.motion.idle');

    expect(idle.frames?.length).toBe(2);
    expect(idle.frameLabels).toEqual(['open', 'blink']);
    expect(idle.timeline).toEqual([
      { frame: 0, holdFrames: 8, label: 'rest' },
      { frame: 1, holdFrames: 1, label: 'blink' },
    ]);
    expect(expandTimelineFrames(idle).length).toBe(9);
  });
});
