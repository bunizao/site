import * as cheerio from 'cheerio';

/**
 * Extract the first image URL from HTML content
 */
export function getFirstImage(content: string): string | null {
  const $ = cheerio.load(content);
  const img = $('.image-preview-wrap img').first();
  const src = img.attr('src');
  if (src) return src;

  // Fallback to simple regex match
  const match = content.match(/<img[^>]+src="([^">]+)"/);
  return match ? match[1] : null;
}

/**
 * Strip HTML tags and convert to plain text
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|blockquote)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Check if content contains media elements
 */
export function hasMedia(content: string): boolean {
  return /<(img|video|audio|iframe)/i.test(content);
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
  $('blockquote').remove();
  $('.bookmark-card').remove();
  $('video, audio, iframe').remove();
  $('.image-list-container, .image-preview-wrap, .image-preview-button, .sticker').remove();
  $('.tgme_widget_message_poll, .tgme_widget_message_document_wrap, .tgme_widget_message_video_player, .tgme_widget_message_location_wrap').remove();

  const cleanedHtml = $.root().html() ?? '';
  const preview = stripHtml(cleanedHtml);
  return preview || fallback;
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
  count: string;
  isPaid: boolean;
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
  reactions?: ReactionData[];
}
