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
  '.rich-content-media--image img',
  '.video-too-big__thumb',
  '.bookmark-card__media img',
  '.mood-gallery-image',
  '.image-preview-wrap img:not(.modal-img)',
  '.tgme_widget_message_photo_wrap img:not(.modal-img)',
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

function renderStructuredImageDetailMedia(document: MoodContentDocument): string {
  const imageMediaHtml = renderRichContentMedia(imageDetailMedia(document));
  if (!imageMediaHtml) return '';

  const $ = cheerio.load(imageMediaHtml, null, false);
  const items = $('.rich-content-media--image img')
    .toArray()
    .map((image) => {
      const src = ($(image).attr('src') ?? '').trim();
      if (!src) return null;

      const figureClassName = $(image).closest('.rich-content-media').attr('class') ?? '';
      return {
        src,
        fallbackSrc: ($(image).attr('data-fallback-src') ?? '').trim() || null,
        width: positiveDimension($(image).attr('width')),
        height: positiveDimension($(image).attr('height')),
        layout: galleryLayout(figureClassName),
        alt: ($(image).attr('alt') ?? '').trim(),
      };
    })
    .filter((item): item is MoodGallery['items'][number] => item !== null);

  if (items.length <= 1) return imageMediaHtml;

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
  const inlineMediaHtml = renderStructuredMoodFeedMediaMarkup(inlineDetailMedia(document));
  const visualMediaHtml = `${imageMediaHtml}${stickerMediaHtml}`;

  return [
    bodyHtml ? `<div class="mood-post-rich-body">${bodyHtml}</div>` : '',
    visualMediaHtml ? `<div class="mood-post-rich-media">${visualMediaHtml}</div>` : '',
    inlineMediaHtml ? `<div class="mood-item-media">${inlineMediaHtml}</div>` : '',
  ].filter(Boolean).join('');
}
