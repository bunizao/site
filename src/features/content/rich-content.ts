import * as cheerio from 'cheerio';
import type { ContentDocument, ContentMediaLayout, MediaItem } from '@bunizao/contracts/content';

export interface RichContentRenderResult {
  bodyHtml: string;
  mediaHtml: string;
  html: string;
  mediaCount: number;
}

export interface RichContentRenderOptions {
  bodyClassName?: string;
  mediaClassName?: string;
  includeMedia?: boolean;
}

const ALLOWED_BODY_TAGS = new Set([
  'a',
  'b',
  'blockquote',
  'br',
  'code',
  'del',
  'em',
  'figcaption',
  'figure',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'li',
  'mark',
  'ol',
  'p',
  'pre',
  's',
  'small',
  'span',
  'strike',
  'strong',
  'time',
  'u',
  'ul',
]);

const REMOVED_BODY_SELECTORS = [
  'audio',
  'base',
  'button',
  'embed',
  'form',
  'iframe',
  'img',
  'input',
  'link',
  'math',
  'meta',
  'object',
  'picture',
  'script',
  'select',
  'source',
  'style',
  'svg',
  'textarea',
  'video',
].join(',');

const PRESERVED_BODY_CLASSES = new Set([
  'bookmark-card',
  'bookmark-card__content',
  'bookmark-card__description',
  'bookmark-card__media',
  'bookmark-card__meta',
  'bookmark-card__title',
  'tg-blockquote-expandable',
  'tg-bot-command',
  'tg-cashtag',
  'tg-datetime',
  'tg-emoji',
  'tg-emoji-fallback',
  'tg-hashtag',
  'tg-mention',
  'tg-spoiler',
]);

const MEDIA_LAYOUTS = new Set<ContentMediaLayout>(['landscape', 'portrait', 'ultra-tall']);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeClassList(value: string, allowedClasses?: Set<string>): string {
  return value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => /^[a-z0-9_-]+(?:__[a-z0-9_-]+)?(?:--[a-z0-9_-]+)?$/i.test(part))
    .filter((part) => !allowedClasses || allowedClasses.has(part))
    .join(' ');
}

function sanitizeSafeUrl(value: unknown, kind: 'href' | 'media'): string {
  if (typeof value !== 'string') return '';

  const trimmed = value.trim();
  if (!trimmed || /[\u0000-\u001F\u007F]/.test(trimmed)) return '';

  const compact = trimmed.replace(/\s+/g, '').toLowerCase();
  if (/^(?:javascript|data|vbscript):/.test(compact)) return '';

  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (kind === 'href' && /^(?:mailto|tel):/i.test(trimmed)) {
    return trimmed;
  }

  if (kind === 'href' && /^[/?#]/.test(trimmed)) {
    return trimmed;
  }

  if (kind === 'media' && trimmed.startsWith('/')) {
    return trimmed;
  }

  if (/^(?:\.\/|\.\.\/)/.test(trimmed)) {
    return trimmed;
  }

  return '';
}

function sanitizeDataValue(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return /^[a-z0-9_:.+-]{1,96}$/i.test(trimmed) ? trimmed : '';
}

function sanitizeCodeClass(value: string): string {
  return value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => /^language-[a-z0-9_-]+$/i.test(part))
    .join(' ');
}

function normalizeDimension(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded > 0 && rounded <= 20000 ? rounded : null;
}

function sanitizeLayout(value: MediaItem['layout']): ContentMediaLayout | null {
  return value && MEDIA_LAYOUTS.has(value) ? value : null;
}

function getMediaLabel(media: MediaItem, fallback: string): string {
  return (media.alt || media.mimeType || media.originalUrl || fallback).trim() || fallback;
}

function renderAttribute(name: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  return ` ${name}="${escapeHtml(String(value))}"`;
}

function renderMediaShell(media: MediaItem, content: string): string {
  const layout = sanitizeLayout(media.layout);
  const className = [
    'rich-content-media',
    `rich-content-media--${media.type}`,
    layout ? `rich-content-media--${layout}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const id = sanitizeDataValue(media.id);

  return `<figure class="${className}"${renderAttribute('data-media-id', id)}>${content}</figure>`;
}

function renderImageMedia(media: MediaItem, src: string): string {
  const fallbackSrc = sanitizeSafeUrl(media.fallbackSrc, 'media');
  const width = normalizeDimension(media.width);
  const height = normalizeDimension(media.height);
  const alt = media.alt?.trim() ?? '';
  const attrs = [
    renderAttribute('src', src),
    renderAttribute('alt', alt),
    renderAttribute('width', width),
    renderAttribute('height', height),
    renderAttribute('data-fallback-src', fallbackSrc),
    ' loading="lazy"',
    ' decoding="async"',
  ].join('');

  return renderMediaShell(media, `<img${attrs} />`);
}

function renderVideoMedia(media: MediaItem, src: string): string {
  const posterSrc = sanitizeSafeUrl(media.posterSrc || media.thumbnailSrc, 'media');
  const width = normalizeDimension(media.width);
  const height = normalizeDimension(media.height);
  const attrs = [
    renderAttribute('src', src),
    renderAttribute('poster', posterSrc),
    renderAttribute('width', width),
    renderAttribute('height', height),
    ' controls',
    ' playsinline',
    ' preload="metadata"',
  ].join('');

  return renderMediaShell(media, `<video${attrs}></video>`);
}

function renderAudioMedia(media: MediaItem, src: string): string {
  return renderMediaShell(media, `<audio${renderAttribute('src', src)} controls preload="metadata"></audio>`);
}

function renderLinkedMedia(media: MediaItem, src: string): string {
  const href = sanitizeSafeUrl(media.originalUrl, 'href') || src;
  const label = getMediaLabel(media, media.type === 'embed' ? 'Open embedded content' : 'Open document');

  return renderMediaShell(
    media,
    `<a href="${escapeHtml(href)}" rel="noopener noreferrer" target="_blank">${escapeHtml(label)}</a>`
  );
}

function renderMediaItem(media: MediaItem): string {
  const src = sanitizeSafeUrl(media.src, 'media');
  if (!src) return '';

  switch (media.type) {
    case 'image':
    case 'sticker':
      return renderImageMedia(media, src);
    case 'video':
      return renderVideoMedia(media, src);
    case 'audio':
      return renderAudioMedia(media, src);
    case 'document':
    case 'embed':
      return renderLinkedMedia(media, src);
    default:
      return '';
  }
}

export function sanitizeRichContentHtml(bodyHtml: string): string {
  const $ = cheerio.load(bodyHtml, { decodeEntities: false }, false);

  $(REMOVED_BODY_SELECTORS).remove();

  $.root()
    .find('*')
    .each((_index, element) => {
      const tag = element.tagName?.toLowerCase();
      if (!tag) return;

      if (!ALLOWED_BODY_TAGS.has(tag)) {
        $(element).replaceWith($(element).contents());
        return;
      }

      const rawAttributes = { ...(element.attribs ?? {}) };
      const attributes = Object.keys(rawAttributes);
      attributes.forEach((attr) => $(element).removeAttr(attr));

      if (tag === 'a') {
        const href = sanitizeSafeUrl(rawAttributes.href, 'href');
        if (!href) {
          $(element).replaceWith($(element).contents());
          return;
        }
        $(element).attr('href', href);
        if (/^https?:\/\//i.test(href)) {
          $(element).attr('target', '_blank');
          $(element).attr('rel', 'noopener noreferrer');
        }
        return;
      }

      if (tag === 'span') {
        const className = sanitizeClassList(rawAttributes.class ?? '', PRESERVED_BODY_CLASSES);
        const emojiId = sanitizeDataValue(rawAttributes['data-emoji-id']);
        const animated = rawAttributes['data-emoji-animated'];

        if (className) {
          $(element).attr('class', className);
        }
        if (emojiId) {
          $(element).attr('data-emoji-id', emojiId);
        }
        if (animated === 'true' || animated === 'false') {
          $(element).attr('data-emoji-animated', animated);
        }
        return;
      }

      if (tag === 'blockquote') {
        const className = sanitizeClassList(rawAttributes.class ?? '', PRESERVED_BODY_CLASSES);
        if (className) {
          $(element).attr('class', className);
        }
        return;
      }

      if (tag === 'code') {
        const className = sanitizeCodeClass(rawAttributes.class ?? '');
        if (className) {
          $(element).attr('class', className);
        }
        return;
      }

      if (tag === 'time') {
        const datetime = sanitizeDataValue(rawAttributes.datetime);
        if (datetime) {
          $(element).attr('datetime', datetime);
        }
      }
    });

  return ($.root().html() ?? '').replace(/\n{3,}/g, '\n\n').trim();
}

export function renderRichContentMedia(media: readonly MediaItem[]): string {
  return media.map(renderMediaItem).filter(Boolean).join('');
}

export function renderRichContentDocument(
  document: Pick<ContentDocument, 'bodyHtml' | 'media'>,
  options: RichContentRenderOptions = {}
): RichContentRenderResult {
  const bodyHtml = sanitizeRichContentHtml(document.bodyHtml);
  const mediaItems = options.includeMedia === false ? [] : document.media.map(renderMediaItem).filter(Boolean);
  const mediaHtml = mediaItems.join('');
  const bodyClassName = sanitizeClassList(options.bodyClassName ?? 'rich-content-body') || 'rich-content-body';
  const mediaClassName = sanitizeClassList(options.mediaClassName ?? 'rich-content-media-list') || 'rich-content-media-list';
  const html = [
    bodyHtml ? `<div class="${bodyClassName}">${bodyHtml}</div>` : '',
    mediaHtml ? `<div class="${mediaClassName}">${mediaHtml}</div>` : '',
  ]
    .filter(Boolean)
    .join('');

  return {
    bodyHtml,
    mediaHtml,
    html,
    mediaCount: mediaItems.length,
  };
}
