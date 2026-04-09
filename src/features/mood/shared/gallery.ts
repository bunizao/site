import * as cheerio from 'cheerio';

import { isEmojiImageElement } from '@/lib/mood-utils';

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

interface MoodGalleryPlaceholder {
  index: number;
  gallery: MoodGallery;
}

interface RenderMoodGalleryOptions {
  variant: MoodGalleryVariant;
  showCountBadge?: boolean;
  priority?: boolean;
}

const GALLERY_PLACEHOLDER_ATTR = 'data-mood-gallery-placeholder';
const RESPONSIVE_IMAGE_WIDTHS = [480, 800, 1200];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parsePositiveInteger(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseStylePixelValue(style: string, property: string): number | null {
  const match = style.match(new RegExp(`${property}\\s*:\\s*([\\d.]+)px`, 'i'));
  if (!match) return null;

  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function parseStyleAspectRatio(style: string): number | null {
  const match = style.match(/aspect-ratio\s*:\s*([\d.]+)\s*\/\s*([\d.]+)/i);
  if (!match) return null;

  const width = Number.parseFloat(match[1]);
  const height = Number.parseFloat(match[2]);
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    return null;
  }

  return width / height;
}

function parseStyleDimensions(style: string): { width: number | null; height: number | null } {
  const directWidth = parseStylePixelValue(style, 'width');
  const directHeight = parseStylePixelValue(style, 'height');
  const variableWidth = parseStylePixelValue(style, '--image-width');
  const variableHeight = parseStylePixelValue(style, '--image-height');
  let width = directWidth ?? variableWidth;
  let height = directHeight ?? variableHeight;
  const paddingMatch = style.match(/padding-top:\s*([\d.]+)%/i);

  if (!height && paddingMatch && width) {
    const paddingPercent = Number.parseFloat(paddingMatch[1]);
    if (Number.isFinite(paddingPercent) && paddingPercent > 0) {
      height = Math.round(width * paddingPercent / 100);
    }
  }

  if ((!width || !height) && style) {
    const ratio = parseStyleAspectRatio(style);
    if (ratio) {
      const fallbackWidth = width ?? 1000;
      width = fallbackWidth;
      height = Math.round(fallbackWidth / ratio);
    }
  }

  return { width, height };
}

function deriveMoodGalleryLayout(width: number | null, height: number | null): MoodGalleryLayout | null {
  if (!width || !height) return null;
  if (height > width * 2.5) return 'ultra-tall';
  if (height > width * 1.2) return 'portrait';
  return 'landscape';
}

function readMoodGalleryLayoutFromClassName(className: string): MoodGalleryLayout | null {
  if (className.includes('image-preview-wrap--ultra-tall')) {
    return 'ultra-tall';
  }
  if (className.includes('image-preview-wrap--portrait')) {
    return 'portrait';
  }
  return null;
}

function extractBackgroundImageUrl(style: string): string {
  const match = style.match(/background-image\s*:\s*url\((['"]?)(.*?)\1\)/i);
  return (match?.[2] ?? '').trim();
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

function normalizeGalleryItems(items: MoodGalleryItem[]): MoodGallery | null {
  const normalized = items.filter((item) => item.src.trim().length > 0);
  if (!normalized.length) {
    return null;
  }

  return {
    items: normalized,
    count: normalized.length,
  };
}

function extractGalleryItemsFromImageListContainer(
  $: cheerio.CheerioAPI,
  container: cheerio.Element,
): MoodGalleryItem[] {
  return $(container)
    .find('.image-preview-wrap')
    .toArray()
    .filter((wrapper) => $(wrapper).closest('.modal').length === 0)
    .map((wrapper) => {
      const image = $(wrapper).find('img:not(.modal-img)').first();
      if (!image.length) {
        return null;
      }

      const src = (image.attr('src') ?? '').trim();
      if (!src) {
        return null;
      }

      const fallbackSrc = (image.attr('data-fallback-src') ?? '').trim() || null;
      const width = parsePositiveInteger(image.attr('width')) ?? parseStylePixelValue($(wrapper).attr('style') ?? '', '--image-width');
      const height = parsePositiveInteger(image.attr('height')) ?? parseStylePixelValue($(wrapper).attr('style') ?? '', '--image-height');
      const className = $(wrapper).attr('class') ?? '';

      return {
        src,
        fallbackSrc,
        width,
        height,
        layout: readMoodGalleryLayoutFromClassName(className) ?? deriveMoodGalleryLayout(width, height),
        alt: (image.attr('alt') ?? '').trim(),
      } satisfies MoodGalleryItem;
    })
    .filter((item): item is MoodGalleryItem => item !== null);
}

function extractGalleryItemFromPhotoWrap($: cheerio.CheerioAPI, wrapper: cheerio.Element): MoodGalleryItem | null {
  const image = $(wrapper).find('img:not(.modal-img)').first();
  const style = ($(wrapper).attr('style') ?? '').trim();
  const className = $(wrapper).attr('class') ?? '';

  if (image.length) {
    const src = (image.attr('src') ?? '').trim();
    if (!src) {
      return null;
    }

    const width = parsePositiveInteger(image.attr('width')) ?? parseStyleDimensions(style).width;
    const height = parsePositiveInteger(image.attr('height')) ?? parseStyleDimensions(style).height;

    return {
      src,
      fallbackSrc: (image.attr('data-fallback-src') ?? '').trim() || null,
      width,
      height,
      layout: readMoodGalleryLayoutFromClassName(className) ?? deriveMoodGalleryLayout(width, height),
      alt: (image.attr('alt') ?? '').trim(),
    };
  }

  const src = extractBackgroundImageUrl(style);
  if (!src) {
    return null;
  }

  const { width, height } = parseStyleDimensions(style);
  return {
    src,
    fallbackSrc: null,
    width,
    height,
    layout: readMoodGalleryLayoutFromClassName(className) ?? deriveMoodGalleryLayout(width, height),
    alt: '',
  };
}

export function getMoodGallery(content: string): MoodGallery | null {
  const groups = getMoodGalleryGroups(content);
  return groups[0] ?? null;
}

export function getMoodGalleryGroups(content: string): MoodGallery[] {
  const $ = cheerio.load(content, { decodeEntities: false });
  const galleries: MoodGallery[] = [];

  $.root()
    .find('.image-list-container, .image-preview-wrap, .tgme_widget_message_photo_wrap')
    .toArray()
    .forEach((node) => {
      const $node = $(node);
      const className = $node.attr('class') ?? '';

      if ($node.closest('.modal').length > 0) {
        return;
      }

      if ($node.is('.image-preview-wrap') && $node.parents('.image-list-container').length > 0) {
        return;
      }

      if (
        $node.is('.tgme_widget_message_photo_wrap') &&
        ($node.parents('.image-list-container').length > 0 || $node.parents('.image-preview-wrap').length > 0)
      ) {
        return;
      }

      const items = $node.is('.image-list-container')
        ? extractGalleryItemsFromImageListContainer($, node)
        : className.includes('image-preview-wrap') || $node.is('.tgme_widget_message_photo_wrap')
          ? [extractGalleryItemFromPhotoWrap($, node)].filter((item): item is MoodGalleryItem => item !== null)
          : [];

      const gallery = normalizeGalleryItems(items);
      if (gallery) {
        galleries.push(gallery);
      }
    });

  return galleries;
}

export function replaceMoodGalleryWithPlaceholders(content: string): {
  contentHtml: string;
  placeholders: MoodGalleryPlaceholder[];
} {
  const $ = cheerio.load(content, { decodeEntities: false });
  const placeholders: MoodGalleryPlaceholder[] = [];
  let placeholderIndex = 0;

  $.root()
    .find('.image-list-container, .image-preview-wrap, .tgme_widget_message_photo_wrap')
    .toArray()
    .forEach((node) => {
      const $node = $(node);

      if ($node.closest('.modal').length > 0) {
        return;
      }

      if ($node.is('.image-preview-wrap') && $node.parents('.image-list-container').length > 0) {
        return;
      }

      if (
        $node.is('.tgme_widget_message_photo_wrap') &&
        ($node.parents('.image-list-container').length > 0 || $node.parents('.image-preview-wrap').length > 0)
      ) {
        return;
      }

      const gallery = $node.is('.image-list-container')
        ? normalizeGalleryItems(extractGalleryItemsFromImageListContainer($, node))
        : normalizeGalleryItems(
            [extractGalleryItemFromPhotoWrap($, node)].filter((item): item is MoodGalleryItem => item !== null)
          );

      if (!gallery) {
        return;
      }

      const index = placeholderIndex++;
      placeholders.push({ index, gallery });
      $node.replaceWith(`<div ${GALLERY_PLACEHOLDER_ATTR}="${index}"></div>`);
    });

  return {
    contentHtml: $.root().html() ?? '',
    placeholders,
  };
}

export function renderMoodGalleryMarkup(
  gallery: MoodGallery,
  options: RenderMoodGalleryOptions,
): string {
  const { variant, showCountBadge = true, priority = false } = options;
  const sizes = getMoodGallerySizes(variant);
  const showBadge = showCountBadge && gallery.count > 1;

  const slides = gallery.items
    .map((item, index) => {
      const srcSet = buildMoodGallerySrcSet(item.src);
      const fallbackSrcSet = item.fallbackSrc ? buildMoodGallerySrcSet(item.fallbackSrc) : '';
      const layoutClass = item.layout ? ` mood-gallery-slide--${item.layout}` : '';
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
        `<div class="mood-gallery-slide${layoutClass}" data-mood-gallery-slide data-gallery-index="${index}" style="--mood-gallery-ratio:${escapeHtml(getMoodGalleryAspectRatio(item))};">`,
        `<img ${attrs} />`,
        '</div>',
      ].join('');
    })
    .join('');

  return [
    `<div class="mood-gallery mood-gallery--${variant}" data-mood-gallery data-mood-gallery-variant="${variant}" data-mood-gallery-count="${gallery.count}"${priority ? ' data-mood-gallery-priority="true"' : ''}>`,
    showBadge ? `<span class="mood-gallery-count" aria-label="${gallery.count} images">${gallery.count}</span>` : '',
    `<div class="mood-gallery-track" data-mood-gallery-track>${slides}</div>`,
    '</div>',
  ].join('');
}

export function renderMoodContentWithGalleries(content: string): string {
  const { contentHtml, placeholders } = replaceMoodGalleryWithPlaceholders(content);
  if (!placeholders.length) {
    return content;
  }

  const $ = cheerio.load(contentHtml, { decodeEntities: false });

  placeholders.forEach(({ index, gallery }) => {
    $(`[${GALLERY_PLACEHOLDER_ATTR}="${index}"]`).replaceWith(
      renderMoodGalleryMarkup(gallery, { variant: 'detail', showCountBadge: true })
    );
  });

  return $.root().html() ?? content;
}
