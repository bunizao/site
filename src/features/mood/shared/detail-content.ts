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
