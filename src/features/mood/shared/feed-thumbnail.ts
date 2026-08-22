export interface MoodFeedThumbnailInput {
  imageWidth?: number | null;
  imageHeight?: number | null;
  imageLayout?: 'landscape' | 'portrait' | 'ultra-tall' | null;
}

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
  if (input.imageLayout === 'portrait' || input.imageLayout === 'ultra-tall') {
    const boxes = containedBoxByLayout[input.imageLayout];
    boxes.forEach((box) => {
      const width = Math.min(box.maxWidth, box.maxHeight * ratio);
      declarations.push(`--mood-thumb-reserved-width${box.name}:${formatCssNumber(width)}px`);
    });
  }

  return `${declarations.join(';')};`;
}
