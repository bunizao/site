import { describe, expect, test } from 'bun:test';
import {
  ACCENT_LIGHTNESS,
  fitChromaToSrgb,
  isOklchInSrgb,
  selectArtworkAccent,
} from '@/lib/listening/artwork-accent';

type Rgba = [number, number, number, number];

function pixels(groups: Array<{ color: Rgba; count: number }>): Uint8ClampedArray {
  return new Uint8ClampedArray(groups.flatMap(({ color, count }) =>
    Array.from({ length: count }, () => color).flat(),
  ));
}

describe('listening artwork accent', () => {
  test('keeps monochrome artwork neutral', () => {
    const data = pixels([{ color: [128, 128, 128, 255], count: 100 }]);
    expect(selectArtworkAccent(data)).toBeNull();
  });

  test('prefers a large muted region over a small saturated region', () => {
    const data = pixels([
      { color: [110, 130, 150, 255], count: 200 },
      { color: [255, 0, 0, 255], count: 20 },
    ]);
    const accent = selectArtworkAccent(data);

    expect(accent).not.toBeNull();
    expect(accent!.hue).toBeGreaterThan(200);
    expect(accent!.hue).toBeLessThan(280);
  });

  test('serializes every hue inside the sRGB gamut', () => {
    for (const lightness of Object.values(ACCENT_LIGHTNESS)) {
      for (let hue = 0; hue < 360; hue += 0.1) {
        const chroma = fitChromaToSrgb(lightness, hue, 0.4);
        expect(isOklchInSrgb(lightness, chroma, hue)).toBe(true);
        expect(chroma * 1_000).toBeInteger();
      }
    }
  });
});
