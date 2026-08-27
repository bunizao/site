// Album artwork accent extraction. Color selection stays independent from the
// listening card controller so the thresholds and gamut guarantees can be
// tested without constructing player DOM.

// A 48px sample agrees with a 96px reference on hue for 99% of the 226-cover
// validation corpus; 64px reached 100% at roughly twice the pixel cost.
const ARTWORK_SAMPLE_SIZE = 48;
const HUE_BUCKET_SIZE = 20;
const CHROMA_BUCKET_SIZE = 0.04;
const LIGHTNESS_BUCKET_SIZE = 0.22;
const MIN_PIXEL_LIGHTNESS = 0.1;
const MAX_PIXEL_LIGHTNESS = 0.95;
// Reject sensor noise in grey covers before ranking individual regions.
const MONOCHROME_CHROMA = 0.02;
const MIN_ACCENT_CHROMA = 0.03;
// At 3%, winners still covered at least 4% of the frame at the corpus's tenth
// percentile. A 4.5% floor made 37% of covers neutral instead of 25%.
const MIN_ACCENT_COVERAGE = 0.03;
// Extra chroma stops improving a region's score beyond this point.
const CHROMA_KNEE = 0.11;
const CHROMA_PRECISION = 1_000;

export const ACCENT_LIGHTNESS = { light: 0.56, dark: 0.74 } as const;

export type ArtworkAccent = {
  hue: number;
  chromaLight: number;
  chromaDark: number;
};

type ColorBucket = {
  aTotal: number;
  bTotal: number;
  count: number;
};

const linearize = (channel: number): number => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

const rgbToOklab = (red: number, green: number, blue: number): [number, number, number] => {
  const r = linearize(red);
  const g = linearize(green);
  const b = linearize(blue);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
};

const hueOf = (a: number, b: number): number => (Math.atan2(b, a) * 180 / Math.PI + 360) % 360;

const oklabToLinearRgb = (lightness: number, a: number, b: number): [number, number, number] => {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.2914855480 * b) ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
};

export const isOklchInSrgb = (lightness: number, chroma: number, hue: number): boolean => {
  const radians = hue * Math.PI / 180;
  const rgb = oklabToLinearRgb(
    lightness,
    chroma * Math.cos(radians),
    chroma * Math.sin(radians),
  );
  return rgb.every((channel) => channel >= 0 && channel <= 1);
};

export const fitChromaToSrgb = (lightness: number, hue: number, chroma: number): number => {
  let low = 0;
  let high = Math.max(0, Math.min(chroma, 0.4));

  for (let step = 0; step < 20; step += 1) {
    const mid = (low + high) / 2;
    if (isOklchInSrgb(lightness, mid, hue)) low = mid;
    else high = mid;
  }

  // CSS receives three decimal places. Flooring keeps the serialized value on
  // the safe side of the boundary; rounding can push it back out of gamut.
  return Math.floor(low * CHROMA_PRECISION) / CHROMA_PRECISION;
};

export const selectArtworkAccent = (data: Uint8ClampedArray): ArtworkAccent | null => {
  const buckets = new Map<string, ColorBucket>();
  const pixelChromas: number[] = [];

  for (let index = 0; index < data.length; index += 4) {
    if ((data[index + 3] ?? 0) < 180) continue;

    const [lightness, a, b] = rgbToOklab(
      data[index] ?? 0,
      data[index + 1] ?? 0,
      data[index + 2] ?? 0,
    );
    const chroma = Math.hypot(a, b);
    pixelChromas.push(chroma);

    if (lightness < MIN_PIXEL_LIGHTNESS || lightness > MAX_PIXEL_LIGHTNESS) continue;

    const key = `${Math.floor(hueOf(a, b) / HUE_BUCKET_SIZE)}`
      + `:${Math.floor(chroma / CHROMA_BUCKET_SIZE)}`
      + `:${Math.floor(lightness / LIGHTNESS_BUCKET_SIZE)}`;
    const bucket = buckets.get(key) ?? { aTotal: 0, bTotal: 0, count: 0 };
    bucket.aTotal += a;
    bucket.bTotal += b;
    bucket.count += 1;
    buckets.set(key, bucket);
  }

  if (!pixelChromas.length) return null;

  pixelChromas.sort((first, second) => first - second);
  const chromaCeiling = pixelChromas[Math.floor(pixelChromas.length * 0.9)] ?? 0;
  if (chromaCeiling < MONOCHROME_CHROMA) return null;

  let selected: ArtworkAccent | null = null;
  let selectedScore = 0;

  for (const bucket of buckets.values()) {
    const a = bucket.aTotal / bucket.count;
    const b = bucket.bTotal / bucket.count;
    const chroma = Math.hypot(a, b);
    const coverage = bucket.count / pixelChromas.length;
    if (chroma < MIN_ACCENT_CHROMA || coverage < MIN_ACCENT_COVERAGE) continue;

    const score = coverage * (0.15 + 0.85 * Math.min(chroma, CHROMA_KNEE) / CHROMA_KNEE);
    if (score <= selectedScore) continue;

    const hue = hueOf(a, b);
    selectedScore = score;
    selected = {
      hue,
      chromaLight: fitChromaToSrgb(ACCENT_LIGHTNESS.light, hue, chroma),
      chromaDark: fitChromaToSrgb(ACCENT_LIGHTNESS.dark, hue, chroma),
    };
  }

  return selected;
};

export const sampleArtworkAccent = (image: HTMLImageElement): ArtworkAccent | null => {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context || !image.naturalWidth || !image.naturalHeight) return null;

  canvas.width = ARTWORK_SAMPLE_SIZE;
  canvas.height = ARTWORK_SAMPLE_SIZE;
  context.drawImage(image, 0, 0, ARTWORK_SAMPLE_SIZE, ARTWORK_SAMPLE_SIZE);
  const { data } = context.getImageData(0, 0, ARTWORK_SAMPLE_SIZE, ARTWORK_SAMPLE_SIZE);
  return selectArtworkAccent(data);
};
