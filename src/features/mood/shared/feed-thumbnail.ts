export interface MoodFeedThumbnailInput {
  imageWidth?: number | null;
  imageHeight?: number | null;
}

function isPositiveNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function getMoodFeedThumbnailStyle(input: MoodFeedThumbnailInput): string | undefined {
  if (!isPositiveNumber(input.imageWidth) || !isPositiveNumber(input.imageHeight)) {
    return undefined;
  }

  return `aspect-ratio:${input.imageWidth} / ${input.imageHeight};`;
}
