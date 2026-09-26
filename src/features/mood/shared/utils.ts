import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';

function isCheerioElement(node: unknown): node is Element {
  return typeof node === 'object' && node !== null && 'type' in node && 'attribs' in node;
}

function isCustomEmojiImageSrc(src: string): boolean {
  return src.trim().toLowerCase().includes('/i/emoji/');
}

/**
 * Deep-clone a loaded document into a fresh, independent CheerioAPI without
 * re-parsing HTML. Used by helpers that mutate the tree (remove/replaceWith)
 * so they never corrupt a `$` shared with other read-only helpers.
 * `cheerio.load()` skips its parser entirely when given an already-built
 * document node, so this is much cheaper than `cheerio.load($.html())`.
 */
function cloneCheerioDocument($: cheerio.CheerioAPI): cheerio.CheerioAPI {
  return cheerio.load($.root().clone().get(0)!);
}

export function isEmojiImageElement(element: Element, $: cheerio.CheerioAPI): boolean {
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

function normalizeMediaUrl(value: string): string {
  if (!value) return '';
  if (value.startsWith('//')) return `https:${value}`;
  return value;
}

function toStaticProxyUrl(value: string): string {
  const normalized = normalizeMediaUrl(value);
  if (!normalized) return '';
  if (normalized.startsWith('/static/') || normalized.includes('/static/https:')) return normalized;
  if (/^(data:|blob:)/i.test(normalized)) return normalized;
  if (/^https?:\/\//i.test(normalized)) {
    return `/static/${normalized.replace('://', ':/')}`;
  }
  return normalized;
}

function hasPhotoWrapImage($: cheerio.CheerioAPI): boolean {
  return $('.tgme_widget_message_photo_wrap').toArray().some((element) => {
    const style = ($(element).attr('style') ?? '').trim();
    const src = extractBackgroundImageUrl(style);
    return Boolean(src) && !isCustomEmojiImageSrc(src);
  });
}

function getFirstValidImageElement($: cheerio.CheerioAPI, selector: string): Element | null {
  const image = $(selector)
    .toArray()
    .find((element) => {
      if (!isCheerioElement(element)) {
        return false;
      }

      if (isEmojiImageElement(element, $)) {
        return false;
      }

      if ($(element).closest('.bookmark-card').length > 0) {
        return false;
      }

      const src = ($(element).attr('src') ?? '').trim();
      return Boolean(src);
    });

  if (!image || !isCheerioElement(image)) {
    return null;
  }

  return image;
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

export function getFirstVideoPosterSrc(content: string | cheerio.CheerioAPI): string | null {
  const $ = typeof content === 'string' ? cheerio.load(content) : content;
  const video = $('video[poster]')
    .toArray()
    .find((element) => {
      const poster = ($(element).attr('poster') ?? '').trim();
      return Boolean(poster);
    });

  if (!video) {
    return null;
  }

  return ($(video).attr('poster') ?? '').trim() || null;
}

export type MoodImageLayout = 'landscape' | 'portrait' | 'ultra-tall';
export type MoodImageKind = 'sticker';

export interface MoodImageMeta {
  src: string | null;
  fallbackSrc: string | null;
  width: number | null;
  height: number | null;
  layout: MoodImageLayout | null;
  kind: MoodImageKind | null;
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

function deriveMoodImageLayout(width: number | null, height: number | null): MoodImageLayout | null {
  if (!width || !height) return null;
  if (height > width * 2.5) return 'ultra-tall';
  if (height > width * 1.2) return 'portrait';
  return 'landscape';
}

function readMoodImageLayoutFromWrapper($: cheerio.CheerioAPI, image: Element): MoodImageLayout | null {
  const wrapperClassName = $(image).closest('.image-preview-wrap, .tgme_widget_message_photo_wrap').attr('class') ?? '';
  if (wrapperClassName.includes('image-preview-wrap--ultra-tall')) {
    return 'ultra-tall';
  }
  if (wrapperClassName.includes('image-preview-wrap--portrait')) {
    return 'portrait';
  }
  return null;
}

function readFirstImageDimensions(
  $: cheerio.CheerioAPI,
  image: Element,
): { width: number | null; height: number | null } {
  const inlineWidth = parsePositiveInteger($(image).attr('width'));
  const inlineHeight = parsePositiveInteger($(image).attr('height'));
  const wrapper = $(image).closest('.image-preview-wrap, .tgme_widget_message_photo_wrap, .video-too-big').first();
  const wrapperStyle = [
    wrapper.attr('style') ?? '',
    wrapper.find('.tgme_widget_message_photo').first().attr('style') ?? '',
  ].join(';').trim();
  const wrapperDimensions = wrapperStyle ? parseStyleDimensions(wrapperStyle) : { width: null, height: null };

  return {
    width: inlineWidth ?? wrapperDimensions.width,
    height: inlineHeight ?? wrapperDimensions.height,
  };
}

function getFirstImageFallbackFromElement($: cheerio.CheerioAPI, image: Element): string | null {
  const fallbackSrc = ($(image).attr('data-fallback-src') ?? '').trim();
  return fallbackSrc || null;
}

export function getFirstImageMeta(content: string | cheerio.CheerioAPI): MoodImageMeta {
  const $ = typeof content === 'string' ? cheerio.load(content) : content;
  const selectors = [
    '.image-preview-wrap img:not(.modal-img)',
    '.image-list-container img:not(.modal-img)',
    '.tgme_widget_message_photo_wrap img',
    'img',
  ];

  for (const selector of selectors) {
    const image = getFirstValidImageElement($, selector);
    if (!image) continue;

    const src = ($(image).attr('src') ?? '').trim() || null;
    const fallbackSrc = getFirstImageFallbackFromElement($, image);
    const { width, height } = readFirstImageDimensions($, image);

    return {
      src,
      fallbackSrc,
      width,
      height,
      layout: readMoodImageLayoutFromWrapper($, image) ?? deriveMoodImageLayout(width, height),
      kind: ($(image).attr('class') ?? '').split(/\s+/).includes('sticker') ? 'sticker' : null,
    };
  }

  const videoPoster = getFirstVideoPosterSrc($);
  if (videoPoster) {
    return {
      src: videoPoster,
      fallbackSrc: null,
      width: null,
      height: null,
      layout: null,
      kind: null,
    };
  }

  const fallbackPhotoSrc = getFirstPhotoWrapImageSrc($);
  if (!fallbackPhotoSrc) {
    return {
      src: null,
      fallbackSrc: null,
      width: null,
      height: null,
      layout: null,
      kind: null,
    };
  }

  const photoWrap = $('.tgme_widget_message_photo_wrap').first();
  const style = [
    photoWrap.attr('style') ?? '',
    photoWrap.find('.tgme_widget_message_photo').first().attr('style') ?? '',
  ].join(';').trim();
  const { width, height } = style ? parseStyleDimensions(style) : { width: null, height: null };

  return {
    src: fallbackPhotoSrc,
    fallbackSrc: null,
    width,
    height,
    layout: deriveMoodImageLayout(width, height),
    kind: null,
  };
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
  '.mood-detail-quote',
  '.mood-comment-quote',
  '.mood-item-quote',
  '.mood-unsupported-media-card',
  '.bookmark-card',
  'video, audio, iframe',
  '.video-too-big',
  '.image-list-container, .image-preview-wrap, .image-preview-button, .sticker',
  '.tgme_widget_message_poll, .tgme_widget_message_document_wrap, .tgme_widget_message_video_player, .tgme_widget_message_location_wrap',
];

// Bookmark card modifiers that survive preview sanitization; the base
// `bookmark-card` class is re-applied unconditionally.
const preservedBookmarkCardModifiers = new Set(['bookmark-card--side-media']);

interface TextPreviewHtmlOptions {
  preserveBookmarks?: boolean;
}

function removePreviewElements($: cheerio.CheerioAPI, options: TextPreviewHtmlOptions = {}): void {
  previewCleanupSelectors.forEach((selector) => {
    if (selector === '.bookmark-card' && options.preserveBookmarks) {
      return;
    }
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

/**
 * Check if content contains media elements
 */
export function hasMedia(content: string | cheerio.CheerioAPI): boolean {
  const $ = typeof content === 'string' ? cheerio.load(content) : content;

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
    '.mood-unsupported-media-card',
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
 * Get inline media preview (video, audio, document, location, or bookmark)
 */
export function getInlineMediaPreview(
  content: string | cheerio.CheerioAPI
): { type: 'video' | 'audio' | 'document' | 'location' | 'bookmark'; html: string } | null {
  const $ = typeof content === 'string' ? cheerio.load(content) : content;

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

  const documentPreview = $('.tgme_widget_message_document_wrap').first();
  if (documentPreview.length) {
    return { type: 'document', html: $.html(documentPreview) };
  }

  const locationPreview = $('.tgme_widget_message_location_wrap').first();
  if (locationPreview.length) {
    return { type: 'location', html: $.html(locationPreview) };
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
export function getTextPreview(
  mood: { text?: string; content: string },
  sharedDocument?: cheerio.CheerioAPI
): string {
  const fallback = (mood.text ?? '').trim();
  // This removes nodes, so never operate directly on a $ shared with other
  // helpers — clone it (cheap: no re-parse) or parse mood.content fresh.
  const $ = sharedDocument ? cloneCheerioDocument(sharedDocument) : cheerio.load(mood.content);

  // Remove elements that shouldn't be in preview
  removePreviewElements($);

  const cleanedHtml = $.root().html() ?? '';
  const preview = stripHtml(cleanedHtml);
  return preview || fallback;
}

/**
 * Check whether content contains emoji image media
 */
export function hasEmojiImageMedia(content: string | cheerio.CheerioAPI): boolean {
  const $ = typeof content === 'string' ? cheerio.load(content) : content;

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

export function hasTooBigVideo(content: string): boolean {
  return /\bvideo-too-big\b|tgme_widget_message_video_player\s+not_supported|message_media_not_supported/i.test(content);
}

/**
 * Get HTML preview with safe inline links preserved
 */
export function getTextPreviewHtml(
  mood: { text?: string; content: string },
  options: TextPreviewHtmlOptions = {},
  sharedDocument?: cheerio.CheerioAPI
): string {
  // This mutates heavily (removes/replaces nodes throughout), so never
  // operate directly on a $ shared with other helpers.
  const $ = sharedDocument ? cloneCheerioDocument(sharedDocument) : cheerio.load(mood.content);
  removePreviewElements($, options);
  $('script, style').remove();

  $.root()
    .find('*')
    .each((_index, element) => {
      const tag = element.tagName?.toLowerCase();
      if (!tag) return;
      const className = $(element).attr('class') ?? '';

      if (options.preserveBookmarks && tag === 'a' && /\bbookmark-card\b/.test(className)) {
        const rawHref = $(element).attr('href') ?? '';
        const safeHref = sanitizePreviewHref(rawHref);
        const text = $(element).text();

        if (!safeHref || !text.trim()) {
          $(element).replaceWith(text);
          return;
        }

        const modifiers = className
          .split(/\s+/)
          .filter((value) => preservedBookmarkCardModifiers.has(value));

        const attributes = Object.keys(element.attribs ?? {});
        attributes.forEach((attr) => $(element).removeAttr(attr));
        $(element).attr('href', safeHref);
        $(element).attr('class', ['bookmark-card', ...modifiers].join(' '));
        $(element).attr('target', '_blank');
        $(element).attr('rel', 'noopener noreferrer');
        return;
      }

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
        if (options.preserveBookmarks) {
          const bookmarkClass = className
            .split(/\s+/)
            .find((value) => /^bookmark-card__(content|title|description|meta|media)$/.test(value));

          if (bookmarkClass) {
            const attributes = Object.keys(element.attribs ?? {});
            attributes.forEach((attr) => $(element).removeAttr(attr));
            $(element).attr('class', bookmarkClass);
            return;
          }
        }

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
        if (options.preserveBookmarks && $(element).parents('.bookmark-card').length > 0) {
          const safeSrc = sanitizePreviewImageSrc($(element).attr('src') ?? '');
          const alt = ($(element).attr('alt') ?? '').trim();

          if (!safeSrc) {
            $(element).replaceWith(alt);
            return;
          }

          const attributes = Object.keys(element.attribs ?? {});
          attributes.forEach((attr) => $(element).removeAttr(attr));
          $(element).attr('src', safeSrc);
          $(element).attr('alt', alt);
          $(element).attr('loading', 'lazy');
          return;
        }

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
  return Boolean(
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
      const pattern = new RegExp(`^${escapeForRegExp(name)}(?:[\\s\\-–—:：]+|$)`, 'i');
      result = result.replace(pattern, '');
    });
  return result.trim();
};

const getReplyMediaLabel = (reply: cheerio.Cheerio<any>): string => {
  if (
    reply.find(
      '.tgme_widget_message_video_wrap, .tgme_widget_message_video_player, video, .message_video_duration'
    ).length
  ) {
    return 'Video';
  }

  if (
    reply.find(
      '.tgme_widget_message_reply_thumb, .tgme_widget_message_photo_wrap, .message_media_not_supported_wrap'
    ).length
  ) {
    return 'Media';
  }

  return (reply.attr('href') ?? '').trim() ? 'Link' : '';
};

const getMoodQuoteThumbnailSrc = (href: string, hdImageBase?: string): string | undefined => {
  if (!hdImageBase) return undefined;

  try {
    const url = new URL(href, 'https://local.invalid');
    const match = url.pathname.match(/^\/mood\/(\d+)$/);
    if (!match) return undefined;
    return `${hdImageBase.replace(/\/+$/, '')}/mood/${encodeURIComponent(match[1])}/0`;
  } catch {
    return undefined;
  }
};

const getReplyThumbnailSrc = (reply: cheerio.Cheerio<any>): string | undefined => {
  const thumb = reply
    .find(
      '.tgme_widget_message_reply_thumb, .tgme_widget_message_video_thumb, .tgme_widget_message_roundvideo_thumb'
    )
    .toArray()
    .map((node) => extractBackgroundImageUrl(isCheerioElement(node) ? node.attribs?.style ?? '' : ''))
    .find(Boolean);

  return thumb ? toStaticProxyUrl(thumb) : undefined;
};

export function getQuotePreview(
  content: string | cheerio.CheerioAPI,
  options: { channel?: string; channelTitle?: string; hdImageBase?: string } = {}
): QuoteData | null {
  const $ = typeof content === 'string' ? cheerio.load(content) : content;
  const reply = $('.tgme_widget_message_reply').first();
  if (!reply.length) {
    const detailQuote = $('.mood-detail-quote, .mood-comment-quote, .mood-item-quote').first();
    if (!detailQuote.length) return null;

    let text = extractMultilineTextFromHtml(
      detailQuote.find('.mood-item-quote-text, .mood-detail-quote-text').first().html() ?? ''
    );
    const author = normalizeText(
      detailQuote.find('.mood-item-quote-author, .mood-detail-quote-source').first().text()
    );
    const hiddenNames = [options.channelTitle ?? '', options.channel ?? ''].filter(Boolean);
    const hideAuthor = shouldHideReplyAuthor(author, options.channel, options.channelTitle);
    const shouldStrip =
      hideAuthor ||
      hiddenNames.some((name) => text.toLowerCase().startsWith(name.toLowerCase()));

    if (shouldStrip) {
      const namesToStrip = hideAuthor ? [author, ...hiddenNames] : hiddenNames;
      text = stripLeadingAuthor(text, namesToStrip.filter(Boolean));
    }

    text = normalizeMultilineText(text);
    if (!text) return null;

    const href = normalizeText(detailQuote.attr('href') ?? '');
    const thumbnailSrc = normalizeText(
      detailQuote.find('.mood-item-quote-image, .mood-detail-quote-image').first().attr('src') ?? ''
    );

    return {
      text,
      author: author && !hideAuthor ? author : undefined,
      href: href || undefined,
      thumbnailSrc: thumbnailSrc || undefined,
    };
  }

  const author = normalizeText(
    [
      '.tgme_widget_message_reply_author',
      '.tgme_widget_message_reply_title',
      '.tgme_widget_message_reply_name',
      '.tgme_widget_message_author_name',
    ]
      .map((selector) => reply.find(selector).first().text())
      .find((value) => normalizeText(value).length > 0) ?? ''
  );
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

  const replyMediaLabel = getReplyMediaLabel(reply);
  const hasInlineReplyMediaPreview = /^(media|video)$/i.test(replyMediaLabel);

  if (!text) {
    text = replyMediaLabel;
  }

  if (!text) return null;

  const href = normalizeText(reply.attr('href') ?? '');
  const inlineThumbnailSrc = hasInlineReplyMediaPreview
    ? getReplyThumbnailSrc(reply)
    : undefined;
  const thumbnailSrc =
    inlineThumbnailSrc ||
    (hasInlineReplyMediaPreview && href
      ? getMoodQuoteThumbnailSrc(href, options.hdImageBase)
      : undefined);

  return {
    text,
    author: hasSeparateText && author && !hideAuthor ? author : undefined,
    href: href || undefined,
    thumbnailSrc,
  };
}

/**
 * Convert string ID to numeric value
 */
export function getNumericId(id: string): number {
  const parsed = Number.parseInt(id, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export interface QuoteData {
  text: string;
  author?: string;
  href?: string;
  thumbnailSrc?: string;
}
