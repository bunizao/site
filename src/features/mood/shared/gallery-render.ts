export type MoodGalleryVariant = 'feed' | 'detail';
export type MoodGalleryLayout = 'landscape' | 'portrait' | 'ultra-tall';

import {
  buildArchiveSrcSet,
  getMoodImagePlaceholderSrc,
  getMoodImageRatio,
} from '@/features/mood/shared/image-srcset';

export interface MoodGalleryItem {
  src: string;
  fallbackSrc: string | null;
  width: number | null;
  height: number | null;
  layout: MoodGalleryLayout | null;
  alt: string;
}

export interface MoodGallery {
  items: MoodGalleryItem[];
  count: number;
}

interface RenderMoodGalleryOptions {
  variant: MoodGalleryVariant;
  priority?: boolean;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getMoodGallerySizes(variant: MoodGalleryVariant): string {
  if (variant === 'detail') {
    return '(min-width: 1024px) 720px, (min-width: 640px) 90vw, calc(100vw - 48px)';
  }

  return '(min-width: 1024px) 560px, (min-width: 640px) 480px, calc(100vw - 96px)';
}

export function getMoodGalleryAspectRatio(item: MoodGalleryItem): string {
  return getMoodImageRatio(item.width, item.height, item.layout).css;
}

export function getMoodGalleryAspectRatioValue(item: MoodGalleryItem): number {
  return getMoodImageRatio(item.width, item.height, item.layout).value;
}

export interface MoodMosaicSpan {
  /* Columns out of six. Two is a third of the band and square; three is half. */
  span: number;
  rows: number;
}

/* The detail gallery is one square, six columns wide, cut up by how many
   images there are and nothing else. Ratios never enter into it: the block is
   the same shape on every post, which is the whole point -- a gallery that
   redraws itself around whatever the archive happens to hold is what made the
   article look assembled by accident.

   Tiles crop. That is what the fixed shape costs, and the viewer pays it back:
   every tile opens full size on click.

   Past six a square would flatten each tile into a strip, so the block gives
   up its shape and keeps the tiles square instead -- rows of three, and a row
   that would come up short splits its width rather than leaving a hole. */
export function getMoodMosaicSpans(count: number): MoodMosaicSpan[] {
  const third: MoodMosaicSpan = { span: 2, rows: 1 };
  const half: MoodMosaicSpan = { span: 3, rows: 1 };

  if (count <= 1) return [{ span: 6, rows: 1 }];
  if (count === 2) return [half, half];
  if (count === 3) return [{ span: 3, rows: 2 }, half, half];
  if (count === 4) return [half, half, half, half];
  if (count === 5) return [half, half, third, third, third];
  if (count === 6) return [third, third, third, third, third, third];

  const spans = Array.from({ length: count }, () => ({ ...third }));
  const remainder = count % 3;
  if (remainder === 1) {
    spans[count - 1] = { span: 6, rows: 1 };
  } else if (remainder === 2) {
    spans[count - 2] = { ...half };
    spans[count - 1] = { ...half };
  }

  return spans;
}

function formatCssNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

export function renderMoodGalleryMarkup(
  gallery: MoodGallery,
  options: RenderMoodGalleryOptions,
): string {
  const { variant, priority = false } = options;
  const mosaic = variant === 'detail' ? getMoodMosaicSpans(gallery.items.length) : null;
  const slides = gallery.items
    .map((item, index) => {
      const layoutClass = item.layout ? ` mood-gallery-slide--${item.layout}` : '';
      const ratio = getMoodImageRatio(item.width, item.height, item.layout);
      const aspectRatio = ratio.value;
      const responsive = buildArchiveSrcSet(item.src, { sizes: getMoodGallerySizes(variant) });
      const placeholderSrc = getMoodImagePlaceholderSrc(item.src);
      const frameClass = ratio.exact ? '' : ' mood-image-frame--estimated';
      const attrs = [
        'class="mood-gallery-image"',
        'data-mood-gallery-image',
        'data-mood-image-main',
        `data-gallery-index="${index}"`,
        `data-deferred-src="${escapeHtml(item.src)}"`,
        responsive.srcset ? `data-deferred-srcset="${escapeHtml(responsive.srcset)}"` : '',
        responsive.srcset && responsive.sizes ? `data-sizes="${escapeHtml(responsive.sizes)}"` : '',
        item.fallbackSrc ? `data-fallback-src="${escapeHtml(item.fallbackSrc)}"` : '',
        item.width ? `width="${item.width}"` : '',
        item.height ? `height="${item.height}"` : '',
        `alt="${escapeHtml(item.alt)}"`,
        'decoding="async"',
        'loading="lazy"',
      ]
        .filter(Boolean)
        .join(' ');

      return [
        `<div class="mood-gallery-slide mood-image-frame${frameClass}${layoutClass}" data-mood-gallery-slide data-mood-image-frame data-gallery-index="${index}" data-aspect-ratio="${escapeHtml(String(aspectRatio))}" style="--mood-gallery-ratio:${escapeHtml(ratio.css)};--mood-image-ratio:${escapeHtml(ratio.css)};--mood-gallery-grow:${formatCssNumber(ratio.value)};${mosaic ? `--mood-mosaic-span:${mosaic[index]?.span ?? 2};--mood-mosaic-rows:${mosaic[index]?.rows ?? 1};` : ''}">`,
        placeholderSrc
          ? `<img class="mood-image-blur" src="${escapeHtml(placeholderSrc)}" alt="" aria-hidden="true" loading="${priority && index === 0 ? 'eager' : 'lazy'}" decoding="async" />`
          : '',
        `<img ${attrs} />`,
        '</div>',
      ].join('');
    })
    .join('');

  return [
    `<div class="mood-gallery mood-gallery--${variant}" data-mood-gallery data-mood-gallery-variant="${variant}" data-mood-gallery-count="${gallery.count}"${priority ? ' data-mood-gallery-priority="true"' : ''}>`,
    `<div class="mood-gallery-track" data-mood-gallery-track>${slides}</div>`,
    '</div>',
  ].join('');
}
