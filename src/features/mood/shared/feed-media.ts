import type { MediaItem } from '@bunizao/contracts/content';
import {
  BLANK_LISTENING_ARTWORK,
  renderListeningCardMarkup,
} from '@/lib/listening/markup';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(value: unknown, kind: 'href' | 'media'): string {
  if (typeof value !== 'string') return '';

  const trimmed = value.trim();
  if (!trimmed || /[\u0000-\u001F\u007F]/.test(trimmed)) return '';

  const compact = trimmed.replace(/\s+/g, '').toLowerCase();
  if (/^(?:javascript|data|vbscript):/.test(compact)) return '';

  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (kind === 'href' && /^[/?#]/.test(trimmed)) return trimmed;
  if (kind === 'media' && trimmed.startsWith('/')) return trimmed;

  return '';
}

function dimension(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded > 0 && rounded <= 20000 ? rounded : null;
}

function attr(name: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  return ` ${name}="${escapeHtml(String(value))}"`;
}

interface RenderMoodFeedMediaOptions {
  lazyVideo?: boolean;
  /**
   * Render audio as the shared listening card (hydrated by
   * src/lib/listening/controller.ts). Surfaces without client JS
   * (RSS, embeds) keep the native <audio> element.
   */
  richAudio?: boolean;
}

function videoClass(media: MediaItem): string {
  const width = dimension(media.width);
  const height = dimension(media.height);
  if (!width || !height) return '';

  const ratio = width / height;
  if (ratio < 0.6) return ' video--ultra-tall';
  if (ratio < 0.8) return ' video--portrait';
  return '';
}

function isTooBigVideoDocument(media: MediaItem): boolean {
  if (media.type !== 'document' || media.mimeType?.toLowerCase() !== 'video') return false;

  const label = (media.title || media.fileName || '').trim().toLowerCase();
  return label === 'media is too big';
}

export function findTooBigVideoMedia(media: readonly MediaItem[] | undefined): MediaItem | null {
  return media?.find(isTooBigVideoDocument) ?? null;
}

function formatDuration(seconds: number | null | undefined): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return '';

  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

function renderTooBigVideo(media: MediaItem): string {
  const href = safeUrl(media.originalUrl || media.href, 'href');
  if (!href) return '';

  const thumbnail = safeUrl(media.thumbnailSrc || media.posterSrc || media.src, 'media');
  const width = dimension(media.width);
  const height = dimension(media.height);
  const aspectStyle = width && height ? ` style="aspect-ratio: ${(width / height).toFixed(4)} / 1"` : '';
  const duration = formatDuration(media.durationSeconds);

  return [
    `<a class="video-too-big" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"${aspectStyle}>`,
    thumbnail ? `<img class="video-too-big__thumb" src="${escapeHtml(thumbnail)}" alt="" loading="lazy" />` : '',
    '<span class="video-too-big__scrim" aria-hidden="true"></span>',
    '<span class="video-too-big__content">',
    '<span class="video-too-big__label">Media is too big</span>',
    '<span class="video-too-big__btn">View in Telegram</span>',
    '</span>',
    duration ? `<span class="video-too-big__duration">${escapeHtml(duration)}</span>` : '',
    '</a>',
  ].join('');
}

function renderVideo(media: MediaItem, options: RenderMoodFeedMediaOptions): string {
  const src = safeUrl(media.src, 'media');
  if (!src) return '';

  const poster = safeUrl(media.posterSrc || media.thumbnailSrc, 'media');
  const className = videoClass(media).trim();
  const sourceAttr = options.lazyVideo
    ? attr('data-mood-video-src', src)
    : attr('src', src);
  const autoplayAttrs = options.lazyVideo ? ' muted loop' : '';
  const lazyAttrs = options.lazyVideo
    ? ' data-mood-autoplay="true" data-mood-video-lazy="true"'
    : '';
  const preload = options.lazyVideo ? 'none' : 'metadata';
  return `<video${attr('class', className)}${sourceAttr}${attr('poster', poster)}${attr('width', dimension(media.width))}${attr('height', dimension(media.height))} controls${autoplayAttrs} playsinline preload="${preload}"${lazyAttrs}></video>`;
}

function renderAudio(media: MediaItem): string {
  const src = safeUrl(media.src, 'media');
  if (!src) return '';

  return `<audio${attr('src', src)} controls preload="metadata"></audio>`;
}

function parseAudioLabel(media: MediaItem): { title: string; artist: string } {
  const raw = (media.title || media.fileName || '').trim();
  const base = raw.replace(/\.[a-z0-9]{2,5}$/i, '').trim();
  if (!base) return { title: 'Voice message', artist: 'Telegram' };

  const parts = base.split(' - ');
  if (parts.length >= 2) {
    const artist = parts[0].trim();
    const title = parts.slice(1).join(' - ').trim();
    if (artist && title) return { title, artist };
  }

  return { title: base, artist: 'Audio' };
}

function renderRichAudio(media: MediaItem): string {
  const src = safeUrl(media.src, 'media');
  if (!src) return '';

  const { title, artist } = parseAudioLabel(media);
  const duration = formatDuration(media.durationSeconds);
  const sizeLabel = media.fileSizeLabel?.trim() || '';
  const artwork = safeUrl(media.thumbnailSrc, 'media') || BLANK_LISTENING_ARTWORK;

  const card = renderListeningCardMarkup({
    title,
    artist,
    collection: duration || sizeLabel || 'Audio',
    year: duration ? sizeLabel : '',
    artworkUrl: artwork,
    linkUrl: safeUrl(media.originalUrl, 'href'),
    previewUrl: src,
    appleCatalogId: '',
    statusLabel: 'Audio',
    isLive: false,
    isLoading: false,
    isStatic: true,
  });

  return `<div class="mood-listening">${card}</div>`;
}

function renderDocument(media: MediaItem): string {
  const href = safeUrl(media.originalUrl || media.href || media.src, 'href') || safeUrl(media.src, 'media');
  if (!href) return '';

  const title = (media.fileName || media.title || media.mimeType || 'Open document').trim();
  const meta = [media.fileSizeLabel, media.mimeType].map((part) => part?.trim()).filter(Boolean).join(' · ');
  const iconClass = media.type === 'audio' ? 'tgme_widget_message_document_icon audio' : 'tgme_widget_message_document_icon';

  return [
    `<a class="tgme_widget_message_document_wrap" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">`,
    `<span class="${iconClass}"></span>`,
    '<span class="tgme_widget_message_document">',
    `<span class="tgme_widget_message_document_title">${escapeHtml(title)}</span>`,
    meta ? `<span class="tgme_widget_message_document_extra">${escapeHtml(meta)}</span>` : '',
    '</span>',
    '</a>',
  ].join('');
}

function renderLinkPreview(media: MediaItem): string {
  const href = safeUrl(media.href || media.originalUrl, 'href');
  if (!href) return '';

  const thumbnail = safeUrl(media.thumbnailSrc || media.src, 'media');
  const title = (media.title || href).trim();
  const description = media.description?.trim() ?? '';
  const siteName = media.siteName?.trim() ?? '';
  const cardClass = thumbnail && media.linkPreviewLayout === 'compact'
    ? 'bookmark-card bookmark-card--side-media'
    : 'bookmark-card';

  return [
    `<a class="${cardClass}" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">`,
    thumbnail ? `<span class="bookmark-card__media"><img src="${escapeHtml(thumbnail)}" alt="" loading="lazy" decoding="async" /></span>` : '',
    '<span class="bookmark-card__content">',
    siteName ? `<span class="bookmark-card__meta">${escapeHtml(siteName)}</span>` : '',
    `<span class="bookmark-card__title">${escapeHtml(title)}</span>`,
    description ? `<span class="bookmark-card__description">${escapeHtml(description)}</span>` : '',
    '</span>',
    '</a>',
  ].join('');
}

function renderLocation(media: MediaItem): string {
  const href = safeUrl(media.href || media.originalUrl, 'href');
  const title = (media.title || 'Location').trim();
  const description = media.description?.trim() ?? '';
  const image = safeUrl(media.thumbnailSrc || media.src, 'media');
  const tagName = href ? 'a' : 'div';
  const hrefAttr = href ? ` href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"` : '';
  const imageStyle = image ? ` style="background-image:url('${escapeHtml(image)}');"` : '';

  return [
    `<${tagName} class="tgme_widget_message_location_wrap"${hrefAttr}>`,
    `<span class="tgme_widget_message_location"${imageStyle}></span>`,
    '<span class="tgme_widget_message_location_info">',
    `<span class="tgme_widget_message_location_title">${escapeHtml(title)}</span>`,
    description ? `<span class="tgme_widget_message_location_address">${escapeHtml(description)}</span>` : '',
    '</span>',
    `</${tagName}>`,
  ].join('');
}

function renderPoll(media: MediaItem): string {
  const title = (media.title || 'Poll').trim();
  const description = media.description?.trim() ?? '';

  return [
    '<div class="mood-unsupported-media-card mood-item-quote mood-comment-quote">',
    '<div class="mood-item-quote-meta"><span class="mood-item-quote-author">Poll</span></div>',
    `<p class="mood-item-quote-text">${escapeHtml(description || title)}</p>`,
    '</div>',
  ].join('');
}

function renderMediaItem(media: MediaItem, options: RenderMoodFeedMediaOptions): string {
  if (isTooBigVideoDocument(media)) {
    return renderTooBigVideo(media);
  }

  switch (media.type) {
    case 'video':
      return renderVideo(media, options);
    case 'audio':
      return (options.richAudio ? renderRichAudio(media) : renderAudio(media)) || renderDocument(media);
    case 'document':
    case 'embed':
      return renderDocument(media);
    case 'link-preview':
      return renderLinkPreview(media);
    case 'location':
      return renderLocation(media);
    case 'poll':
      return renderPoll(media);
    default:
      return '';
  }
}

export function renderStructuredMoodFeedMediaMarkup(
  media: readonly MediaItem[] | undefined,
  options: RenderMoodFeedMediaOptions = {},
): string {
  if (!media?.length) return '';

  const items = media
    .filter((item) => item.type !== 'image' && item.type !== 'sticker')
    .map((item) => renderMediaItem(item, options))
    .filter(Boolean);

  return items.join('');
}

export function hasStructuredMoodFeedMedia(media: readonly MediaItem[] | undefined): boolean {
  return renderStructuredMoodFeedMediaMarkup(media).length > 0;
}
