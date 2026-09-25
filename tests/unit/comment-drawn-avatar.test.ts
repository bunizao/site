import { describe, expect, test } from 'bun:test';
import { AVATAR_CLASSES, avatarClass, isAvatarSeed, seedInClass } from '@bunizao/contracts/comments';
import { anonymousSeeds, AVATAR_PALETTE, drawnAvatarSvg } from '@/features/comments/drawn-avatar';

/** [base, accent, glaze] in paint order. */
const fills = (svg: string) => [...svg.matchAll(/<(?:rect|path)[^>]*fill="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1]);

describe('drawnAvatarSvg', () => {
  test('every class is its own colour pair, and no shape vanishes into the base', () => {
    const pairs = new Set<string>();
    for (let cls = 0; cls < AVATAR_CLASSES; cls++) {
      const [base, accent, glaze] = fills(drawnAvatarSvg(seedInClass(cls, 12345)));
      expect(AVATAR_PALETTE).toContain(base as (typeof AVATAR_PALETTE)[number]);
      expect(new Set([base, accent, glaze]).size).toBe(3);
      pairs.add(`${base}/${accent}`);
    }
    expect(pairs.size).toBe(AVATAR_CLASSES);
  });

  test('the same seed draws the same face, and the markup carries no id', () => {
    const svg = drawnAvatarSvg(987654321);
    expect(drawnAvatarSvg(987654321)).toBe(svg);
    // The same face appears several times on one page (every copy of the
    // reader's own); an id would repeat.
    expect(svg).not.toMatch(/\sid=/);
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

  test('five faces wear five different base colours and five different accents', () => {
    for (let i = 0; i < 500; i++) {
      const basis = `post-${i}`;
      const colours = anonymousSeeds(5, new Set(), basis).map((seed) => fills(drawnAvatarSvg(seed)));
      expect(new Set(colours.map(([base]) => base)).size).toBe(5);
      expect(new Set(colours.map(([, accent]) => accent)).size).toBe(5);
    }
  });

  test('covers all classes before repeating', () => {
    const classes = anonymousSeeds(AVATAR_CLASSES, new Set(), 'post-1').map(avatarClass);
    expect(new Set(classes).size).toBe(AVATAR_CLASSES);
  });
});
