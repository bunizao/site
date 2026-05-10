export type MoodGalleryVariant = 'feed' | 'detail';
export type MoodGalleryLayout = 'landscape' | 'portrait' | 'ultra-tall';

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

const RESPONSIVE_IMAGE_WIDTHS = [480, 800, 1200];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function withWidthParam(value: string, width: number): string {
  if (!value || /^(data:|blob:)/i.test(value)) return value;

  try {
    const isAbsolute = /^(https?:)?\/\//i.test(value);
    const parsed = new URL(value, 'https://local.invalid');
    parsed.searchParams.set('w', String(width));
    return isAbsolute ? parsed.toString().replace('https://local.invalid', '') : `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return value;
  }
}

export function buildMoodGallerySrcSet(value: string, widths = RESPONSIVE_IMAGE_WIDTHS): string {
  if (!value || /^(data:|blob:)/i.test(value)) return '';
  return widths.map((width) => `${withWidthParam(value, width)} ${width}w`).join(', ');
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
  const sizes = getMoodGallerySizes(variant);

  const slides = gallery.items
    .map((item, index) => {
      const srcSet = buildMoodGallerySrcSet(item.src);
      const fallbackSrcSet = item.fallbackSrc ? buildMoodGallerySrcSet(item.fallbackSrc) : '';
      const layoutClass = item.layout ? ` mood-gallery-slide--${item.layout}` : '';
      const aspectRatio = getMoodGalleryAspectRatioValue(item);
      const attrs = [
        'class="mood-gallery-image"',
        'data-mood-gallery-image',
        `data-gallery-index="${index}"`,
        `data-deferred-src="${escapeHtml(item.src)}"`,
        srcSet ? `data-deferred-srcset="${escapeHtml(srcSet)}"` : '',
        `data-sizes="${escapeHtml(sizes)}"`,
        item.fallbackSrc ? `data-fallback-src="${escapeHtml(item.fallbackSrc)}"` : '',
        fallbackSrcSet ? `data-fallback-srcset="${escapeHtml(fallbackSrcSet)}"` : '',
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
