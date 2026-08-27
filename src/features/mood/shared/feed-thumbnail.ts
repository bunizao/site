import {
  getMoodImageRatio,
  resolveMoodImageLayout,
  type MoodImageLayout,
} from '@/features/mood/shared/image-srcset';

export interface MoodFeedThumbnailInput {
  imageWidth?: number | null;
  imageHeight?: number | null;
  imageLayout?: MoodImageLayout | null;
  mediaKind?: 'image' | 'sticker' | 'video';
}

export type MoodFeedImageLayout = MoodImageLayout;

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

export function resolveMoodFeedImageLayout(
  value: unknown,
  imageWidth?: number | null,
  imageHeight?: number | null,
): MoodFeedImageLayout | null {
  return resolveMoodImageLayout(value, imageWidth, imageHeight);
}

export function getMoodFeedThumbnailStyle(input: MoodFeedThumbnailInput): string {
  const layout = resolveMoodFeedImageLayout(input.imageLayout, input.imageWidth, input.imageHeight);
  let ratio = getMoodImageRatio(input.imageWidth, input.imageHeight, layout);
  if (!ratio.exact && !layout && input.mediaKind === 'sticker') {
    ratio = { css: '1 / 1', value: 1, exact: false };
  } else if (!ratio.exact && !layout && input.mediaKind === 'video') {
    ratio = { css: '16 / 9', value: 16 / 9, exact: false };
  }
  const declarations = [
    `aspect-ratio:${ratio.css}`,
    `--mood-thumb-ratio:${ratio.css}`,
    `--mood-image-ratio:${ratio.css}`,
  ];

  /* Portrait and ultra-tall thumbs size to `fit-content`, so before the image
     decodes the wrapper is 0px wide and the aspect-ratio above resolves to 0px
     tall. Every feed item with one collapsed and then popped open mid-scroll.
     These widths are the contained box the image will land in, so the wrapper
     holds its own height from first paint. */
  if (layout === 'portrait' || layout === 'ultra-tall') {
    const boxes = containedBoxByLayout[layout];
    boxes.forEach((box) => {
      const width = Math.min(box.maxWidth, box.maxHeight * ratio.value);
      declarations.push(`--mood-thumb-reserved-width${box.name}:${formatCssNumber(width)}px`);
    });
  }

  return `${declarations.join(';')};`;
}
