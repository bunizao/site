import { describe, expect, test } from 'bun:test';
import { AVATAR_CLASSES, avatarClass, isAvatarSeed, seedInClass } from '@bunizao/contracts/comments';
import { AVATAR_PALETTE_COUNT, avatarPalette } from '@/features/comments/avatar-palettes';
import {
  anonymousSeeds,
  avatarParts,
  AVATAR_STYLES,
  drawnAvatarSvg,
  seedOfParts,
  type AvatarStyle,
} from '@/features/comments/drawn-avatar';

/** Fills in paint order: base, then accent (the beam head), then the rest. */
const fills = (svg: string) => [...svg.matchAll(/<(?:rect|path)[^>]*fill="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1]);
const random = () => Math.floor(Math.random() * 0xffffffff);

describe('avatar palettes', () => {
  test('at least 500 palettes of five distinct colours', () => {
    expect(AVATAR_PALETTE_COUNT).toBeGreaterThanOrEqual(500);
    for (let i = 0; i < AVATAR_PALETTE_COUNT; i++) {
      const palette = avatarPalette(i);
      for (const colour of palette) expect(colour).toMatch(/^#[0-9a-f]{6}$/);
      expect(new Set(palette).size).toBe(5);
    }
  });
});

describe('seed parts', () => {
  test('round-trip through a valid seed', () => {
    for (let i = 0; i < 1000; i++) {
      const parts = avatarParts(random());
      const seed = seedOfParts(parts);
      expect(isAvatarSeed(seed)).toBe(true);
      expect(avatarParts(seed)).toEqual(parts);
    }
  });

  test('random seeds spread across styles and palettes', () => {
    const styles = new Map<AvatarStyle, number>();
    const palettes = new Set<number>();
    for (let i = 0; i < 6000; i++) {
      const { style, palette } = avatarParts(random());
      styles.set(style, (styles.get(style) ?? 0) + 1);
      palettes.add(palette);
    }
    for (const style of AVATAR_STYLES) expect(styles.get(style)).toBeGreaterThan(1800);
    expect(palettes.size).toBeGreaterThan(AVATAR_PALETTE_COUNT * 0.9);
  });
});

describe('drawnAvatarSvg', () => {
  for (const style of AVATAR_STYLES) {
    test(`${style}: every class in a palette is its own colour pair`, () => {
      for (const palette of [0, 1, 200, AVATAR_PALETTE_COUNT - 1]) {
        const pairs = new Set<string>();
        for (let cls = 0; cls < AVATAR_CLASSES; cls++) {
          const [base, accent] = fills(drawnAvatarSvg(seedOfParts({ cls, style, palette, shape: 4321 })));
          expect(base).not.toBe(accent);
          if (style !== 'mist') {
            expect(avatarPalette(palette)).toContain(base);
            expect(avatarPalette(palette)).toContain(accent);
          }
          pairs.add(`${base}/${accent}`);
        }
        expect(pairs.size).toBe(AVATAR_CLASSES);
      }
    });
  }

  test('only the washes blur; the beam face keeps its eyes sharp', () => {
    const parts = { cls: 3, palette: 7, shape: 99 };
    expect(drawnAvatarSvg(seedOfParts({ ...parts, style: 'beam' }))).not.toContain('drawn-face');
    expect(drawnAvatarSvg(seedOfParts({ ...parts, style: 'marble' }))).toContain('class="drawn-face"');
    expect(drawnAvatarSvg(seedOfParts({ ...parts, style: 'mist' }))).toContain('class="drawn-face"');
  });

  test('the same seed draws the same face, and the markup carries no id', () => {
    for (let i = 0; i < 50; i++) {
      const seed = random();
      const svg = drawnAvatarSvg(seed);
      expect(drawnAvatarSvg(seed)).toBe(svg);
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
  test('never repeats a class or palette the named faces already wear', () => {
    const taken = [random(), random(), random()];
    const takenParts = taken.map(avatarParts);
    const parts = anonymousSeeds(6, taken, 'post-1').map(avatarParts);
    for (const { cls, palette } of parts) {
      expect(takenParts.some((t) => t.cls === cls)).toBe(false);
      expect(takenParts.some((t) => t.palette === palette)).toBe(false);
    }
    expect(new Set(parts.map((p) => p.cls)).size).toBe(parts.length);
    expect(new Set(parts.map((p) => p.palette)).size).toBe(parts.length);
  });

  test('neighbours never share a style', () => {
    for (let i = 0; i < 500; i++) {
      const styles = anonymousSeeds(8, [random()], `post-${i}`).map((seed) => avatarParts(seed).style);
      for (let j = 1; j < styles.length; j++) expect(styles[j]).not.toBe(styles[j - 1]);
    }
  });

  test('is stable per post and differs between posts', () => {
    expect(anonymousSeeds(3, [], 'post-1')).toEqual(anonymousSeeds(3, [], 'post-1'));
    expect(anonymousSeeds(3, [], 'post-1')).not.toEqual(anonymousSeeds(3, [], 'post-2'));
  });

  test('covers all classes before repeating', () => {
    const classes = anonymousSeeds(AVATAR_CLASSES, [], 'post-1').map(avatarClass);
    expect(new Set(classes).size).toBe(AVATAR_CLASSES);
  });
});
