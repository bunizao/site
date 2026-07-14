import * as cheerio from 'cheerio';
import type { MoodContentDocument } from '@bunizao/contracts';
import {
  renderRichContentMedia,
  sanitizeRichContentHtml,
} from '@/features/content/rich-content';
import { renderStructuredMoodFeedMediaMarkup } from './feed-media';

function imageDetailMedia(document: MoodContentDocument): MoodContentDocument['media'] {
  return document.media.filter((item) => item.type === 'image' || item.type === 'sticker');
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
  const imageMediaHtml = renderRichContentMedia(imageDetailMedia(document));
  const inlineMediaHtml = renderStructuredMoodFeedMediaMarkup(inlineDetailMedia(document));

  return [
    bodyHtml ? `<div class="mood-post-rich-body">${bodyHtml}</div>` : '',
    imageMediaHtml ? `<div class="mood-post-rich-media">${imageMediaHtml}</div>` : '',
    inlineMediaHtml ? `<div class="mood-item-media">${inlineMediaHtml}</div>` : '',
  ].filter(Boolean).join('');
}
