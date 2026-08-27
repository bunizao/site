import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import {
  getMoodImagePlaceholderSrc,
  getMoodImageRatio,
} from '@/features/mood/shared/image-srcset';
import {
  renderMoodGalleryMarkup,
  type MoodGallery,
  type MoodGalleryItem,
  type MoodGalleryLayout,
} from '@/features/mood/shared/gallery-render';

export { renderMoodGalleryMarkup } from '@/features/mood/shared/gallery-render';
export type {
  MoodGallery,
  MoodGalleryItem,
  MoodGalleryLayout,
  MoodGalleryVariant,
} from '@/features/mood/shared/gallery-render';

interface MoodGalleryPlaceholder {
  index: number;
  gallery: MoodGallery;
}

const GALLERY_PLACEHOLDER_ATTR = 'data-mood-gallery-placeholder';

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
  container: Element,
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

function extractGalleryItemFromPhotoWrap($: cheerio.CheerioAPI, wrapper: Element): MoodGalleryItem | null {
  const image = $(wrapper).find('img:not(.modal-img)').first();
  const style = [
    $(wrapper).attr('style') ?? '',
    $(wrapper).find('.tgme_widget_message_photo').first().attr('style') ?? '',
  ].join(';').trim();
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
  const $ = cheerio.load(content);
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
  const $ = cheerio.load(content);
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

      if (!gallery || gallery.count <= 1) {
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

function appendStyle(existing: string, declaration: string): string {
  const trimmed = existing.trim();
  return `${trimmed}${trimmed && !trimmed.endsWith(';') ? ';' : ''}${declaration}`;
}

function enhanceStandaloneMoodImages(content: string): string {
  const $ = cheerio.load(content, null, false);

  $('.image-preview-wrap').each((_index, wrapper) => {
    const $wrapper = $(wrapper);
    if ($wrapper.hasClass('modal') || $wrapper.closest('.mood-gallery').length > 0) return;

    const image = $wrapper.find('img:not(.modal-img):not(.mood-image-blur)').first();
    const src = (image.attr('src') ?? '').trim();
    if (!image.length || !src) return;

    const width = parsePositiveInteger(image.attr('width'))
      ?? parseStylePixelValue($wrapper.attr('style') ?? '', '--image-width');
    const height = parsePositiveInteger(image.attr('height'))
      ?? parseStylePixelValue($wrapper.attr('style') ?? '', '--image-height');
    const layout = readMoodGalleryLayoutFromClassName($wrapper.attr('class') ?? '')
      ?? deriveMoodGalleryLayout(width, height);
    const ratio = getMoodImageRatio(width, height, layout);

    $wrapper.addClass('mood-image-frame');
    if (!ratio.exact) $wrapper.addClass('mood-image-frame--estimated');
    $wrapper.attr('data-mood-image-frame', '');
    $wrapper.attr(
      'style',
      appendStyle($wrapper.attr('style') ?? '', `--mood-image-ratio:${ratio.css};`),
    );
    image.attr('data-mood-image-main', '');

    const placeholderSrc = getMoodImagePlaceholderSrc(src);
    if (placeholderSrc) {
      const placeholder = $('<img>')
        .addClass('mood-image-blur')
        .attr({
          src: placeholderSrc,
          alt: '',
          'aria-hidden': 'true',
          loading: 'lazy',
          decoding: 'async',
        });
      image.before(placeholder);
    }
  });

  return $.root().html() ?? content;
}

export function renderMoodContentWithGalleries(content: string): string {
  const { contentHtml, placeholders } = replaceMoodGalleryWithPlaceholders(content);
  if (!placeholders.length) {
    return enhanceStandaloneMoodImages(content);
  }

  const $ = cheerio.load(contentHtml);

  placeholders.forEach(({ index, gallery }) => {
    $(`[${GALLERY_PLACEHOLDER_ATTR}="${index}"]`).replaceWith(
      renderMoodGalleryMarkup(gallery, { variant: 'detail' })
    );
  });

  const rendered = $('body').html()?.trim() || $.root().html() || content;
  return enhanceStandaloneMoodImages(rendered);
}
