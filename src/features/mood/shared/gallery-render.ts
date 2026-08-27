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

function formatCssNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

export function renderMoodGalleryMarkup(
  gallery: MoodGallery,
  options: RenderMoodGalleryOptions,
): string {
  const { variant, priority = false } = options;
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
        `<div class="mood-gallery-slide mood-image-frame${frameClass}${layoutClass}" data-mood-gallery-slide data-mood-image-frame data-gallery-index="${index}" data-aspect-ratio="${escapeHtml(String(aspectRatio))}" style="--mood-gallery-ratio:${escapeHtml(ratio.css)};--mood-image-ratio:${escapeHtml(ratio.css)};--mood-gallery-grow:${formatCssNumber(ratio.value)};--mood-gallery-basis:${formatCssNumber(ratio.value * 160)}px;--mood-gallery-basis-sm:${formatCssNumber(ratio.value * 260)}px;--mood-gallery-basis-lg:${formatCssNumber(ratio.value * 320)}px;--mood-gallery-max-width:${formatCssNumber(Math.min(760, ratio.value * 210))}px;--mood-gallery-max-width-sm:${formatCssNumber(Math.min(760, ratio.value * 420))}px;--mood-gallery-max-width-lg:${formatCssNumber(Math.min(760, ratio.value * 420))}px;">`,
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
