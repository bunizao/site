import { describe, expect, test } from 'bun:test';
import {
  getPeekAsset,
  getPeekAssets,
  getPeekBase,
  getPeekPreviewSections,
  getPeekRuntimeBehaviors,
  getPeekSlot,
  getPeekSlotKey,
  getPeekTrackingPoseKeys,
} from '../../src/features/mascot/peek/catalog';
import { PEEK } from '../../src/features/logos/data/peek';
import { PEEK_COSTUME_LOOKS, PEEK_EXPRESSION_LOOKS } from '../../src/features/logos/data/peek-looks';

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

describe('peek legacy compatibility', () => {
  test('keeps the legacy logo definition powered by the mascot catalog', () => {
    const base = getPeekBase();
    const idleAsset = getPeekAsset('peek.motion.idle');
    if (!idleAsset.frames) {
      throw new Error('peek.motion.idle should expose frames');
    }

    expect(PEEK.id).toBe(base.id);
    expect(PEEK.width).toBe(base.width);
    expect(PEEK.height).toBe(base.height);
    expect(PEEK.base).toEqual(base.base);
    expect(PEEK.animations.idle.fps).toBe(2);
    expect(PEEK.animations.idle.frames).toEqual(idleAsset.frames);
    expect(PEEK.animations.happy.aliasOf).toBe('purr');
  });

  test('keeps legacy look registries aligned with the mascot catalog', () => {
    const expressionAssets = getPeekAssets({ kind: 'expression' });
    const costumeAssets = getPeekAssets({ kind: 'costume' });
    const firstExpression = expressionAssets[0];
    const firstCostume = costumeAssets[0];
    const firstExpressionLook = PEEK_EXPRESSION_LOOKS[0];
    const firstCostumeLook = PEEK_COSTUME_LOOKS[0];

    if (!firstExpression?.grid || !firstCostume?.grid || !firstExpressionLook || !firstCostumeLook) {
      throw new Error('peek look compatibility fixtures should exist');
    }

    expect(PEEK_EXPRESSION_LOOKS.map((look) => look.label)).toEqual(
      expressionAssets.map((asset) => asset.key),
    );
    expect(PEEK_COSTUME_LOOKS.map((look) => look.label)).toEqual(
      costumeAssets.map((asset) => asset.key),
    );
    expect(firstExpressionLook.grid).toEqual(firstExpression.grid);
    expect(firstCostumeLook.grid).toEqual(firstCostume.grid);
  });
});
