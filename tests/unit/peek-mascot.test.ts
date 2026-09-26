import { describe, expect, test } from 'bun:test';
import {
  getPeekAsset,
  getPeekAssets,
  getPeekPreviewSections,
  getPeekRuntimeBehaviors,
  getPeekSlot,
  getPeekSlotKey,
  getPeekTrackingPoseKeys,
} from '../../src/features/mascot/peek/catalog';
import { expandTimelineFrames } from '../../src/features/mascot/peek/timeline';

describe('peek mascot catalog', () => {
  test('exposes stable brand and runtime slots', () => {
    expect(getPeekSlotKey('navbar.brand.default')).toBe('idle');
    expect(getPeekSlotKey('navbar.brand.hover')).toBe('dart');
    expect(getPeekSlotKey('not-found.tracker.default')).toBe('scan');
    expect(getPeekSlot('navbar.section.active').holdMs).toBe(600);
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

  test('builds preview sections from catalog metadata instead of ad hoc arrays', () => {
    const sections = getPeekPreviewSections();
    const sectionIds = sections.map((section) => section.id);

    expect(sectionIds).toEqual([
      'core',
      'nav',
      'tracking',
      'utility',
      'expressions',
      'costumes',
    ]);

    expect(sections.find((section) => section.id === 'expressions')?.items.every((item) => item.kind === 'expression')).toBe(true);
    expect(sections.find((section) => section.id === 'costumes')?.items.every((item) => item.kind === 'costume')).toBe(true);
    expect(sections.find((section) => section.id === 'tracking')?.items.some((item) => item.key === 'scan')).toBe(true);
  });

  test('keeps catalog ids unique and frames structurally valid', () => {
    const assets = getPeekAssets();
    const ids = assets.map((asset) => asset.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(ids.length);

    for (const asset of assets) {
      if (asset.frames) {
        expect(asset.frames.length).toBeGreaterThan(0);
        const height = asset.frames[0]?.length ?? 0;
        const width = asset.frames[0]?.[0]?.length ?? 0;
        for (const frame of asset.frames) {
          expect(frame.length).toBe(height);
          expect(frame[0]?.length ?? 0).toBe(width);
        }
      }
    }
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

  test('exposes runtime behavior rows wired through slots', () => {
    expect(getPeekRuntimeBehaviors()).toEqual([
      {
        slotId: 'navbar.brand.default',
        label: 'Default rest state',
        description: 'Navbar brand mark at rest before hover or event overrides.',
        animation: 'idle',
        assetId: 'peek.motion.idle',
      },
      {
        slotId: 'navbar.brand.hover',
        label: 'Brand hover and fast scroll',
        description: 'Used for home hover and high-velocity scroll bursts.',
        animation: 'dart',
        assetId: 'peek.motion.dart',
      },
      {
        slotId: 'navbar.nav-link.hover',
        label: 'Nav link hover',
        description: 'Desktop section links trigger a curious expression on pointer enter.',
        animation: 'curious',
        assetId: 'peek.motion.curious',
      },
      {
        slotId: 'navbar.section.active',
        label: 'Section activation',
        description: 'When the active section changes, navbar code fires a short happy burst.',
        animation: 'happy',
        assetId: 'peek.motion.happy',
      },
      {
        slotId: 'navbar.idle-timeout',
        label: 'Long idle timeout',
        description: 'After ten seconds of inactivity, the navbar mascot falls into its sleepy alias.',
        animation: 'sleepy',
        assetId: 'peek.motion.sleepy',
      },
    ]);
  });
});
