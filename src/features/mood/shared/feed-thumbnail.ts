export interface MoodFeedThumbnailInput {
  imageWidth?: number | null;
  imageHeight?: number | null;
  imageLayout?: 'landscape' | 'portrait' | 'ultra-tall' | null;
}

export type MoodFeedImageLayout = 'landscape' | 'portrait' | 'ultra-tall';

function isPositiveNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

const containedBoxByLayout = {
  portrait: [
    { name: '', maxWidth: 220, maxHeight: 280 },
    { name: '-sm', maxWidth: 240, maxHeight: 320 },
    { name: '-lg', maxWidth: 260, maxHeight: 360 },
  ],
  'ultra-tall': [
    { name: '', maxWidth: 180, maxHeight: 320 },
    { name: '-sm', maxWidth: 200, maxHeight: 360 },
    { name: '-lg', maxWidth: 220, maxHeight: 400 },
  ],
} as const;

/** Resolve the layout consistently before and after client hydration. */
export function resolveMoodFeedImageLayout(
  value: unknown,
  imageWidth?: number | null,
  imageHeight?: number | null,
): MoodFeedImageLayout | null {
  if (value === 'landscape' || value === 'portrait' || value === 'ultra-tall') {
    return value;
  }
  if (!isPositiveNumber(imageWidth) || !isPositiveNumber(imageHeight)) {
    return null;
  }

  const aspectRatio = imageWidth / imageHeight;
  if (aspectRatio < 0.6) return 'ultra-tall';
  if (aspectRatio < 0.8) return 'portrait';
  return 'landscape';
}

function formatCssNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

export function getMoodFeedThumbnailStyle(input: MoodFeedThumbnailInput): string | undefined {
  if (!isPositiveNumber(input.imageWidth) || !isPositiveNumber(input.imageHeight)) {
    return undefined;
  }

  const ratio = input.imageWidth / input.imageHeight;
  const declarations = [
    `aspect-ratio:${input.imageWidth} / ${input.imageHeight}`,
    `--mood-thumb-ratio:${input.imageWidth} / ${input.imageHeight}`,
  ];

  /* Portrait and ultra-tall thumbs size to `fit-content`, so before the image
     decodes the wrapper is 0px wide and the aspect-ratio above resolves to 0px
     tall. Every feed item with one collapsed and then popped open mid-scroll.
     These widths are the contained box the image will land in, so the wrapper
     holds its own height from first paint. */
  const layout = resolveMoodFeedImageLayout(input.imageLayout, input.imageWidth, input.imageHeight);
  if (layout === 'portrait' || layout === 'ultra-tall') {
    const boxes = containedBoxByLayout[layout];
    boxes.forEach((box) => {
      const width = Math.min(box.maxWidth, box.maxHeight * ratio);
      declarations.push(`--mood-thumb-reserved-width${box.name}:${formatCssNumber(width)}px`);
    });
  }

  return `${declarations.join(';')};`;
}
