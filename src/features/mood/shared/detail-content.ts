import * as cheerio from 'cheerio';
import type { MoodContentDocument } from '@bunizao/contracts';
import {
  renderRichContentMedia,
  sanitizeRichContentHtml,
} from '@/features/content/rich-content';
import { renderStructuredMoodFeedMediaMarkup } from './feed-media';
import {
  renderMoodGalleryMarkup,
  type MoodGallery,
  type MoodGalleryLayout,
} from './gallery-render';
import {
  getMoodImagePlaceholderSrc,
  getMoodImageRatio,
  resolveMoodImageLayout,
} from './image-srcset';

function imageDetailMedia(document: MoodContentDocument): MoodContentDocument['media'] {
  return document.media.filter((item) => item.type === 'image');
}

function stickerDetailMedia(document: MoodContentDocument): MoodContentDocument['media'] {
  return document.media.filter((item) => item.type === 'sticker');
}

function inlineDetailMedia(document: MoodContentDocument): MoodContentDocument['media'] {
  return document.media.filter((item) => item.type !== 'image' && item.type !== 'sticker');
}

const DETAIL_MEDIA_IMAGE_SELECTOR = [
  '.rich-content-media--image img:not(.mood-image-blur)',
  '.video-too-big__thumb',
  '.bookmark-card__media img',
  '.mood-gallery-image',
  '.image-preview-wrap img:not(.modal-img):not(.mood-image-blur)',
  '.tgme_widget_message_photo_wrap img:not(.modal-img):not(.mood-image-blur)',
].join(',');

function positiveDimension(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function galleryLayout(className: string): MoodGalleryLayout | null {
  if (className.includes('rich-content-media--ultra-tall')) return 'ultra-tall';
  if (className.includes('rich-content-media--portrait')) return 'portrait';
  if (className.includes('rich-content-media--landscape')) return 'landscape';
  return null;
}

function appendStyle(existing: string, declaration: string): string {
  const trimmed = existing.trim();
  return `${trimmed}${trimmed && !trimmed.endsWith(';') ? ';' : ''}${declaration}`;
}

function renderStructuredImageDetailMedia(document: MoodContentDocument): string {
  const imageMediaHtml = renderRichContentMedia(imageDetailMedia(document));
  if (!imageMediaHtml) return '';

  const $ = cheerio.load(imageMediaHtml, null, false);
  const items = $('.rich-content-media--image img')
    .toArray()
    .map((image) => {
      const src = ($(image).attr('src') ?? '').trim();
      if (!src) return null;

      const figure = $(image).closest('.rich-content-media');
      const figureClassName = figure.attr('class') ?? '';
      const width = positiveDimension($(image).attr('width'));
      const height = positiveDimension($(image).attr('height'));
      return {
        src,
        fallbackSrc: ($(image).attr('data-fallback-src') ?? '').trim() || null,
        width,
        height,
        layout: galleryLayout(figureClassName) ?? resolveMoodImageLayout(null, width, height),
        alt: ($(image).attr('alt') ?? '').trim(),
      };
    })
    .filter((item): item is MoodGallery['items'][number] => item !== null);

  if (items.length <= 1) {
    const item = items[0];
    const image = $('.rich-content-media--image img').first();
    const frame = image.closest('.rich-content-media--image');
    if (!item || !image.length || !frame.length) return imageMediaHtml;

    const ratio = getMoodImageRatio(item.width, item.height, item.layout);
    frame.addClass('mood-image-frame');
    if (item.layout) frame.addClass(`rich-content-media--${item.layout}`);
    if (!ratio.exact) frame.addClass('mood-image-frame--estimated');
    frame.attr('data-mood-image-frame', '');
    frame.attr(
      'style',
      appendStyle(
        frame.attr('style') ?? '',
        `--mood-image-ratio:${ratio.css};--mood-image-ratio-value:${ratio.value};`,
      ),
    );
    image.attr('data-mood-image-main', '');

    const placeholderSrc = getMoodImagePlaceholderSrc(item.src);
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

    return $.root().html() ?? imageMediaHtml;
  }

  return renderMoodGalleryMarkup(
    { items, count: items.length },
    { variant: 'detail' },
  );
}

export function prioritizeMoodDetailMedia(contentHtml: string): string {
  if (!contentHtml) return contentHtml;

  const $ = cheerio.load(contentHtml, null, false);
  const image = $(DETAIL_MEDIA_IMAGE_SELECTOR).first();
  if (!image.length) return contentHtml;

  const deferredSrc = image.attr('data-deferred-src');
  if (!image.attr('src') && deferredSrc) {
    image.attr('src', deferredSrc);
  }

  image.attr('loading', 'eager');
  image.attr('fetchpriority', 'high');
  image.attr('decoding', 'sync');

  return $.root().html() ?? contentHtml;
}

export function renderStructuredMoodDetailContent(document: MoodContentDocument): string {
  const bodyHtml = sanitizeRichContentHtml(document.bodyHtml);
  const imageMediaHtml = renderStructuredImageDetailMedia(document);
  const stickerMediaHtml = renderRichContentMedia(stickerDetailMedia(document));
  const inlineMediaHtml = renderStructuredMoodFeedMediaMarkup(inlineDetailMedia(document), { richAudio: true });
  const visualMediaHtml = `${imageMediaHtml}${stickerMediaHtml}`;

  return [
    bodyHtml ? `<div class="mood-post-rich-body">${bodyHtml}</div>` : '',
    visualMediaHtml ? `<div class="mood-post-rich-media">${visualMediaHtml}</div>` : '',
    inlineMediaHtml ? `<div class="mood-item-media">${inlineMediaHtml}</div>` : '',
  ].filter(Boolean).join('');
}
