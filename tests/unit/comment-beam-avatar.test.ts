import { describe, expect, test } from 'bun:test';
import { AVATAR_CLASSES, avatarClass, isAvatarSeed, seedInClass } from '@bunizao/contracts/comments';
import { anonymousSeeds, BEAM_PALETTE, beamAvatarSvg } from '@/features/comments/beam-avatar';

const fills = (svg: string) => [...svg.matchAll(/<rect[^>]*fill="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1]);

describe('beamAvatarSvg', () => {
  test('every class is its own colour pair and no head vanishes into its background', () => {
    const pairs = new Set<string>();
    for (let cls = 0; cls < AVATAR_CLASSES; cls++) {
      const [background, head] = fills(beamAvatarSvg(seedInClass(cls, 12345)));
      expect(BEAM_PALETTE).toContain(background as (typeof BEAM_PALETTE)[number]);
      expect(head).not.toBe(background);
      pairs.add(`${background}/${head}`);
    }
    expect(pairs.size).toBe(AVATAR_CLASSES);
  });

  test('the same seed draws the same face, and no mask id is emitted', () => {
    const svg = beamAvatarSvg(987654321);
    expect(beamAvatarSvg(987654321)).toBe(svg);
    expect(svg).not.toContain('mask');
  });
});

describe('seedInClass', () => {
  test('lands in the asked class and stays a valid seed', () => {
    for (const variety of [0, 1, 7, 2 ** 31, -5, 4.9]) {
      const seed = seedInClass(13, variety);
      expect(isAvatarSeed(seed)).toBe(true);
      expect(avatarClass(seed)).toBe(13);
    }
  });
});

describe('anonymousSeeds', () => {
  test('never repeats a class the named faces already wear', () => {
    const taken = new Set([0, 5, 11]);
    const seeds = anonymousSeeds(6, taken, 'post-1');
    const classes = seeds.map(avatarClass);
    for (const cls of classes) expect(taken.has(cls)).toBe(false);
    expect(new Set(classes).size).toBe(classes.length);
  });

  test('is stable per post and differs between posts', () => {
    expect(anonymousSeeds(3, new Set(), 'post-1')).toEqual(anonymousSeeds(3, new Set(), 'post-1'));
    expect(anonymousSeeds(3, new Set(), 'post-1')).not.toEqual(anonymousSeeds(3, new Set(), 'post-2'));
  });

  test('five faces wear five different head colours', () => {
    const heads = anonymousSeeds(5, new Set(), 'post-1').map((seed) => fills(beamAvatarSvg(seed))[1]);
    expect(new Set(heads).size).toBe(5);
  });

  test('covers all classes before repeating', () => {
    const classes = anonymousSeeds(AVATAR_CLASSES, new Set(), 'post-1').map(avatarClass);
    expect(new Set(classes).size).toBe(AVATAR_CLASSES);
  });
});
