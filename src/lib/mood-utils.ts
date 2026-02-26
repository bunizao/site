import * as cheerio from 'cheerio';

function isCustomEmojiImageSrc(src: string): boolean {
  return src.trim().toLowerCase().includes('/i/emoji/');
}

export function isEmojiImageElement(element: cheerio.Element, $: cheerio.CheerioAPI): boolean {
  const $element = $(element);

  if ($element.closest('.tg-emoji, .mood-reaction-emoji').length > 0) {
    return true;
  }

  const className = $element.attr('class') ?? '';
  if (/\b(tg-emoji|mood-reaction-emoji)\b/.test(className)) {
    return true;
  }

  const src = ($element.attr('src') ?? '').trim();
  return Boolean(src) && isCustomEmojiImageSrc(src);
}

function extractBackgroundImageUrl(style: string): string {
  const match = style.match(/background-image\s*:\s*url\((['"]?)(.*?)\1\)/i);
  return (match?.[2] ?? '').trim();
}

function hasPhotoWrapImage($: cheerio.CheerioAPI): boolean {
  return $('.tgme_widget_message_photo_wrap').toArray().some((element) => {
    const style = ($(element).attr('style') ?? '').trim();
    const src = extractBackgroundImageUrl(style);
    return Boolean(src) && !isCustomEmojiImageSrc(src);
  });
}

function getFirstValidImageSrc($: cheerio.CheerioAPI, selector: string): string | null {
  const image = $(selector)
    .toArray()
    .find((element) => {
      if (isEmojiImageElement(element, $)) {
        return false;
      }

      const src = ($(element).attr('src') ?? '').trim();
      return Boolean(src);
    });

  if (!image) {
    return null;
  }

  return ($(image).attr('src') ?? '').trim() || null;
}

function getFirstPhotoWrapImageSrc($: cheerio.CheerioAPI): string | null {
  const photoWrap = $('.tgme_widget_message_photo_wrap')
    .toArray()
    .find((element) => {
      const style = ($(element).attr('style') ?? '').trim();
      const src = extractBackgroundImageUrl(style);
      return Boolean(src) && !isCustomEmojiImageSrc(src);
    });

  if (!photoWrap) {
    return null;
  }

  const style = ($(photoWrap).attr('style') ?? '').trim();
  return extractBackgroundImageUrl(style) || null;
}

/**
 * Extract the first image URL from HTML content
 */
export function getFirstImage(content: string): string | null {
  const $ = cheerio.load(content);

  const selectors = [
    '.image-preview-wrap img:not(.modal-img)',
    '.image-list-container img:not(.modal-img)',
    '.tgme_widget_message_photo_wrap img',
    'img',
  ];

  for (const selector of selectors) {
    const src = getFirstValidImageSrc($, selector);
    if (src) {
      return src;
    }
  }

  return getFirstPhotoWrapImageSrc($);
}

/**
 * Strip HTML tags and convert to plain text
 */
export function stripHtml(html: string): string {
  const $ = cheerio.load(html);

  $('br').replaceWith('\n');

  const blockTags = ['p', 'div', 'li', 'blockquote'];
  for (const tag of blockTags) {
    $(tag).each((_index, element) => {
      const $element = $(element);
      const lastNode = $element.contents().last();

      if (!lastNode.length || !lastNode.text().endsWith('\n')) {
        $element.append('\n');
      }
    });
  }

  return $.root()
    .text()
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeMultilineText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractMultilineTextFromHtml(html: string): string {
  if (!html) return '';
  return normalizeMultilineText(stripHtml(html));
}

const previewCleanupSelectors = [
  '.tgme_widget_message_reply',
  '.bookmark-card',
  'video, audio, iframe',
  '.image-list-container, .image-preview-wrap, .image-preview-button, .sticker',
  '.tgme_widget_message_poll, .tgme_widget_message_document_wrap, .tgme_widget_message_video_player, .tgme_widget_message_location_wrap',
];

function removePreviewElements($: cheerio.CheerioAPI): void {
  previewCleanupSelectors.forEach((selector) => {
    $(selector).remove();
  });
}

function sanitizePreviewHref(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed;
  if (/^[/?#]/.test(trimmed)) return trimmed;
  if (trimmed.startsWith('.')) return trimmed;
  return '';
}

function sanitizePreviewImageSrc(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[/?]/.test(trimmed)) return trimmed;
  return '';
}

function normalizeRelatedUrl(value: string, baseUrl?: string): string {
  const safe = sanitizePreviewHref(value);
  if (!safe) return '';

  if (/^https?:\/\//i.test(safe)) {
    return safe;
  }

  if (!baseUrl) {
    return '';
  }

  try {
    const resolved = new URL(safe, baseUrl).toString();
    return /^https?:\/\//i.test(resolved) ? resolved : '';
  } catch {
    return '';
  }
}

const plainUrlPattern = /\bhttps?:\/\/[^\s<>"')\]]+/gi;

export interface RelatedLinkData {
  url: string;
  type: 'link' | 'image';
}

/**
 * Extract related links from mood content for email/newsletter rendering
 */
export function getRelatedLinks(
  mood: { text?: string; content: string },
  options: { baseUrl?: string; maxCount?: number } = {}
): RelatedLinkData[] {
  const maxCount = Math.max(1, Math.min(options.maxCount ?? 8, 30));
  const collected: RelatedLinkData[] = [];
  const seen = new Set<string>();

  const appendLink = (candidate: string | undefined, type: RelatedLinkData['type']): void => {
    const normalized = normalizeRelatedUrl(candidate ?? '', options.baseUrl);
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    collected.push({ url: normalized, type });
  };

  const $ = cheerio.load(mood.content, { decodeEntities: false });

  $('a[href]').each((_index, element) => {
    appendLink($(element).attr('href'), 'link');
  });

  $('img[src]').each((_index, element) => {
    if (isEmojiImageElement(element, $)) {
      return;
    }

    appendLink($(element).attr('src'), 'image');
  });

  const textSources = [mood.text ?? '', stripHtml(mood.content)];
  for (const source of textSources) {
    const pattern = new RegExp(plainUrlPattern);
    for (const match of source.matchAll(pattern)) {
      appendLink(match[0], 'link');
      if (collected.length >= maxCount) {
        return collected;
      }
    }
  }

  return collected.slice(0, maxCount);
}

/**
 * Check if content contains media elements
 */
export function hasMedia(content: string): boolean {
  const $ = cheerio.load(content);

  const hasValidImage = $('img')
    .toArray()
    .some((element) => {
      if (isEmojiImageElement(element, $)) {
        return false;
      }
      const src = ($(element).attr('src') ?? '').trim();
      return Boolean(src);
    });

  if (hasValidImage || hasPhotoWrapImage($)) {
    return true;
  }

  return [
    'video',
    'audio',
    'iframe',
    '.bookmark-card',
    '.tgme_widget_message_document_wrap',
    '.tgme_widget_message_video_player',
    '.tgme_widget_message_location_wrap',
  ].some((selector) => $(selector).length > 0);
}

/**
 * Check if text is long enough to warrant a detail page
 */
export function isLongContent(text: string): boolean {
  return text.length > 280;
}

/**
 * Get inline media preview (video, audio, or bookmark)
 */
export function getInlineMediaPreview(content: string): { type: 'video' | 'audio' | 'bookmark'; html: string } | null {
  const $ = cheerio.load(content);

  const video = $('video').first();
  if (video.length) {
    return { type: 'video', html: $.html(video) };
  }

  const audio = $('audio').first();
  if (audio.length) {
    return { type: 'audio', html: $.html(audio) };
  }

  const audioDoc = $('.tgme_widget_message_document_wrap')
    .filter((_index, el) => $(el).find('.tgme_widget_message_document_icon.audio').length > 0)
    .first();
  if (audioDoc.length) {
    return { type: 'audio', html: $.html(audioDoc) };
  }

  const bookmark = $('.bookmark-card').first();
  if (bookmark.length) {
    return { type: 'bookmark', html: $.html(bookmark) };
  }

  return null;
}

/**
 * Get clean text preview from mood content
 */
export function getTextPreview(mood: { text?: string; content: string }): string {
  const fallback = (mood.text ?? '').trim();
  const $ = cheerio.load(mood.content);

  // Remove elements that shouldn't be in preview
  removePreviewElements($);

  const cleanedHtml = $.root().html() ?? '';
  const preview = stripHtml(cleanedHtml);
  return preview || fallback;
}

/**
 * Check whether content contains image media
 */
export function hasImageMedia(content: string): boolean {
  const $ = cheerio.load(content);

  const hasValidImage = $('img')
    .toArray()
    .some((element) => {
      if (isEmojiImageElement(element, $)) {
        return false;
      }
      const src = ($(element).attr('src') ?? '').trim();
      return Boolean(src);
    });

  return hasValidImage || hasPhotoWrapImage($);
}

/**
 * Check whether content contains emoji image media
 */
export function hasEmojiImageMedia(content: string): boolean {
  const $ = cheerio.load(content);

  return $('img')
    .toArray()
    .some((element) => {
      if (!isEmojiImageElement(element, $)) {
        return false;
      }

      const src = ($(element).attr('src') ?? '').trim();
      return Boolean(src);
    });
}

/**
 * Check whether content contains video media
 */
export function hasVideoMedia(content: string): boolean {
  return /<(video)\b/i.test(content);
}

/**
 * Check whether content contains audio media
 */
export function hasAudioMedia(content: string): boolean {
  return /<(audio)\b|tgme_widget_message_voice|tgme_widget_message_document_icon[^"']*\baudio\b/i.test(content);
}

/**
 * Build media indicator prefix for text previews
 */
export function getMediaIndicatorPrefix(content: string): string {
  const indicators: string[] = [];
  if (hasImageMedia(content)) indicators.push('🖼️');
  if (hasVideoMedia(content)) indicators.push('🎬');
  if (hasAudioMedia(content)) indicators.push('🎧');
  return indicators.join(' ');
}

/**
 * Get text preview and prepend media indicators when media exists
 */
export function getTextPreviewWithMedia(mood: { text?: string; content: string }): string {
  const preview = getTextPreview(mood);
  const prefix = getMediaIndicatorPrefix(mood.content);
  if (!prefix) {
    return preview;
  }
  const body = preview || '(No text preview)';
  return `${prefix} ${body}`;
}

/**
 * Get HTML preview with safe inline links preserved
 */
export function getTextPreviewHtml(mood: { text?: string; content: string }): string {
  const $ = cheerio.load(mood.content, { decodeEntities: false });
  removePreviewElements($);
  $('script, style').remove();

  $.root()
    .find('*')
    .each((_index, element) => {
      const tag = element.tagName?.toLowerCase();
      if (!tag) return;

      if (tag === 'a') {
        const rawHref = $(element).attr('href') ?? '';
        const safeHref = sanitizePreviewHref(rawHref);
        const text = $(element).text();

        if (!safeHref || !text.trim()) {
          $(element).replaceWith(text);
          return;
        }

        const attributes = Object.keys(element.attribs ?? {});
        attributes.forEach((attr) => {
          if (attr !== 'href') {
            $(element).removeAttr(attr);
          }
        });
        $(element).attr('href', safeHref);
        return;
      }

      if (tag === 'span') {
        const className = $(element).attr('class') ?? '';
        const isEmojiWrapper = /\b(tg-emoji|mood-reaction-emoji)\b/.test(className);
        if (isEmojiWrapper) {
          const emojiId = ($(element).attr('data-emoji-id') ?? '').trim();
          const animated = ($(element).attr('data-emoji-animated') ?? '').trim();
          const ariaLabel = ($(element).attr('aria-label') ?? '').trim();

          const attributes = Object.keys(element.attribs ?? {});
          attributes.forEach((attr) => $(element).removeAttr(attr));
          $(element).attr('class', 'tg-emoji');

          if (emojiId) {
            $(element).attr('data-emoji-id', emojiId);
          }
          if (animated === 'true' || animated === 'false') {
            $(element).attr('data-emoji-animated', animated);
          }
          if (ariaLabel) {
            $(element).attr('aria-label', ariaLabel);
          }

          return;
        }
      }

      if (tag === 'img') {
        if (!isEmojiImageElement(element, $)) {
          $(element).remove();
          return;
        }

        const safeSrc = sanitizePreviewImageSrc($(element).attr('src') ?? '');
        const alt = ($(element).attr('alt') ?? '').trim();
        const className = ($(element).attr('class') ?? '')
          .split(/\s+/)
          .filter((value) => value === 'tg-emoji-fallback')
          .join(' ');

        if (!safeSrc) {
          $(element).replaceWith(alt);
          return;
        }

        const attributes = Object.keys(element.attribs ?? {});
        attributes.forEach((attr) => $(element).removeAttr(attr));
        $(element).attr('src', safeSrc);
        $(element).attr('alt', alt);
        $(element).attr('loading', 'lazy');
        if (className) {
          $(element).attr('class', className);
        }
        return;
      }

      if (tag === 'br') {
        return;
      }

      // Preserve rich text formatting tags (keep in-place, strip attributes)
      const richTextTags = ['blockquote', 'pre', 'code', 'b', 'strong', 'i', 'em', 'u', 's', 'del', 'strike'];
      if (richTextTags.includes(tag)) {
        const attributes = Object.keys(element.attribs ?? {});
        attributes.forEach((attr) => $(element).removeAttr(attr));
        return;
      }

      $(element).replaceWith($(element).contents());
    });

  const previewHtml = $.root().html() ?? '';
  return previewHtml.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Extract reply/quote preview from mood content
 */
const normalizeReplyAuthor = (value: string): string =>
  value.replace(/\s+/g, ' ').trim().replace(/^@/, '').toLowerCase();

const shouldHideReplyAuthor = (
  value: string,
  channel?: string,
  channelTitle?: string
): boolean => {
  const normalized = normalizeReplyAuthor(value);
  if (!normalized) return false;
  const channelNormalized = normalizeReplyAuthor(channel ?? '');
  const titleNormalized = normalizeReplyAuthor(channelTitle ?? '');
  return (
    (channelNormalized && normalized === channelNormalized) ||
    (titleNormalized && normalized === titleNormalized)
  );
};

const escapeForRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const stripLeadingAuthor = (value: string, hiddenNames: string[]): string => {
  let result = value;
  hiddenNames
    .map((name) => name.trim())
    .filter(Boolean)
    .forEach((name) => {
      const pattern = new RegExp(`^${escapeForRegExp(name)}[\\s\\-–—:：]+`, 'i');
      result = result.replace(pattern, '');
    });
  return result.trim();
};

export function getQuotePreview(
  content: string,
  options: { channel?: string; channelTitle?: string } = {}
): QuoteData | null {
  const $ = cheerio.load(content);
  const reply = $('.tgme_widget_message_reply').first();
  if (!reply.length) return null;

  const author = normalizeText(reply.find('.tgme_widget_message_reply_author').first().text());
  const replyText = extractMultilineTextFromHtml(
    reply.find('.tgme_widget_message_reply_text').first().html() ?? ''
  );
  const raw = extractMultilineTextFromHtml(reply.html() ?? '');
  const hasSeparateText = Boolean(replyText);
  const hiddenNames = [options.channelTitle ?? '', options.channel ?? ''].filter(Boolean);
  const hideAuthor = shouldHideReplyAuthor(author, options.channel, options.channelTitle);
  let text = hasSeparateText ? replyText : raw;
  const shouldStrip =
    hideAuthor ||
    hiddenNames.some((name) => text.toLowerCase().startsWith(name.toLowerCase()));
  if (shouldStrip) {
    const namesToStrip = hideAuthor ? [author, ...hiddenNames] : hiddenNames;
    text = stripLeadingAuthor(text, namesToStrip.filter(Boolean));
  }

  text = normalizeMultilineText(text);

  if (!text) return null;

  const href = normalizeText(reply.attr('href') ?? '');

  return {
    text,
    author: hasSeparateText && author && !hideAuthor ? author : undefined,
    href: href || undefined,
  };
}

/**
 * Convert string ID to numeric value
 */
export function getNumericId(id: string): number {
  const parsed = Number.parseInt(id, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Format datetime for display
 */
export function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Format date as YYYY-MM-DD
 */
export function formatDateKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format date header with relative dates (Today, Yesterday)
 */
export function formatDateHeader(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const now = new Date();

  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) return 'Today';

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  if (isYesterday) return 'Yesterday';

  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  if (date.getFullYear() === now.getFullYear()) {
    return `${months[date.getMonth()]} ${date.getDate()}`;
  }
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/**
 * Group moods by date
 */
export function groupByDate<T extends { datetime: string }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const dateKey = formatDateKey(item.datetime);
    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(item);
  }
  return groups;
}

/**
 * Reaction data structure
 */
export interface ReactionData {
  emoji: string;
  emojiId?: string;
  emojiImage?: string;
  count: string;
  isPaid: boolean;
}

export interface ForwardedFromData {
  name: string;
  href?: string;
  author?: string;
}

export interface QuoteData {
  text: string;
  author?: string;
  href?: string;
}

/**
 * Mood data structure for API responses
 */
export interface MoodData {
  id: string;
  datetime: string;
  tag?: string;
  previewText: string;
  image?: string | null;
  mediaHtml?: string;
  needsDetailPage?: boolean;
  forwardedFrom?: ForwardedFromData | null;
  quote?: QuoteData | null;
  reactions?: ReactionData[];
  commentsCount?: number;
}
