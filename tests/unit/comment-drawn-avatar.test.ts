import { describe, expect, test } from 'bun:test';
import { AVATAR_CLASSES, avatarClass, isAvatarSeed, seedInClass } from '@bunizao/contracts/comments';
import {
  anonymousSeeds,
  AVATAR_PALETTES,
  AVATAR_STYLES,
  avatarStyle,
  drawnAvatarSvg,
  type AvatarStyle,
} from '@/features/comments/drawn-avatar';

/** Palette fills in paint order: [base, accent] and, for the washes, a glaze. */
const fills = (svg: string) => [...svg.matchAll(/<(?:rect|path)[^>]*fill="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1]);

/** A seed in `cls` that draws `style`. */
const seedOf = (cls: number, style: AvatarStyle, variety = 12345) =>
  seedInClass(cls, variety - (variety % 3) + AVATAR_STYLES.indexOf(style));

describe('drawnAvatarSvg', () => {
  for (const style of AVATAR_STYLES) {
    test(`${style}: every class is its own colour pair, and no shape vanishes into the base`, () => {
      const pairs = new Set<string>();
      for (let cls = 0; cls < AVATAR_CLASSES; cls++) {
        const seed = seedOf(cls, style);
        expect(avatarStyle(seed)).toBe(style);
        const colours = fills(drawnAvatarSvg(seed));
        expect(colours.length).toBe(style === 'beam' ? 2 : 3);
        for (const colour of colours) expect(AVATAR_PALETTES[style]).toContain(colour);
        expect(new Set(colours).size).toBe(colours.length);
        pairs.add(`${colours[0]}/${colours[1]}`);
      }
      expect(pairs.size).toBe(AVATAR_CLASSES);
    });
  }

  test('only the washes blur; the beam face keeps its eyes sharp', () => {
    expect(drawnAvatarSvg(seedOf(3, 'beam'))).not.toContain('drawn-face');
    expect(drawnAvatarSvg(seedOf(3, 'marble'))).toContain('class="drawn-face"');
    expect(drawnAvatarSvg(seedOf(3, 'mist'))).toContain('class="drawn-face"');
  });

  test('random seeds spread evenly across the styles', () => {
    const counts = new Map<AvatarStyle, number>();
    for (let i = 0; i < 3000; i++) {
      const style = avatarStyle(Math.floor(Math.random() * 0xffffffff));
      counts.set(style, (counts.get(style) ?? 0) + 1);
    }
    for (const style of AVATAR_STYLES) expect(counts.get(style)).toBeGreaterThan(850);
  });

  test('the same seed draws the same face, and the markup carries no id', () => {
    for (const style of AVATAR_STYLES) {
      const svg = drawnAvatarSvg(seedOf(7, style, 987654321));
      expect(drawnAvatarSvg(seedOf(7, style, 987654321))).toBe(svg);
      // The same face appears several times on one page (every copy of the
      // reader's own); an id would repeat.
      expect(svg).not.toMatch(/\sid=/);
    }
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

  test('neighbours never share a style', () => {
    for (let i = 0; i < 500; i++) {
      const seeds = anonymousSeeds(8, new Set([i % 20]), `post-${i}`);
      for (let j = 1; j < seeds.length; j++) expect(avatarStyle(seeds[j])).not.toBe(avatarStyle(seeds[j - 1]));
    }
  });

  test('covers all classes before repeating', () => {
    const classes = anonymousSeeds(AVATAR_CLASSES, new Set(), 'post-1').map(avatarClass);
    expect(new Set(classes).size).toBe(AVATAR_CLASSES);
  });
});
