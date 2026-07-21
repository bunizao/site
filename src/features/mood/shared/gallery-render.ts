export type MoodGalleryVariant = 'feed' | 'detail';
export type MoodGalleryLayout = 'landscape' | 'portrait' | 'ultra-tall';

import { buildArchiveSrcSet } from '@/features/mood/shared/image-srcset';

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
  if (item.width && item.height) {
    return `${item.width} / ${item.height}`;
  }

  if (item.layout === 'portrait') {
    return '3 / 4';
  }
  if (item.layout === 'ultra-tall') {
    return '9 / 16';
  }
  return '4 / 3';
}

export function getMoodGalleryAspectRatioValue(item: MoodGalleryItem): number {
  if (item.width && item.height) {
    return item.width / item.height;
  }

  if (item.layout === 'portrait') {
    return 3 / 4;
  }
  if (item.layout === 'ultra-tall') {
    return 9 / 16;
  }
  return 4 / 3;
}

export function renderMoodGalleryMarkup(
  gallery: MoodGallery,
  options: RenderMoodGalleryOptions,
): string {
  const { variant, priority = false } = options;
  const slides = gallery.items
    .map((item, index) => {
      const layoutClass = item.layout ? ` mood-gallery-slide--${item.layout}` : '';
      const aspectRatio = getMoodGalleryAspectRatioValue(item);
      const responsive = buildArchiveSrcSet(item.src, { sizes: getMoodGallerySizes(variant) });
      const attrs = [
        'class="mood-gallery-image"',
        'data-mood-gallery-image',
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
        `<div class="mood-gallery-slide${layoutClass}" data-mood-gallery-slide data-gallery-index="${index}" data-aspect-ratio="${escapeHtml(String(aspectRatio))}" style="--mood-gallery-ratio:${escapeHtml(getMoodGalleryAspectRatio(item))};">`,
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
