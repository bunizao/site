import * as cheerio from 'cheerio';
import type { MediaItem, MoodContentDocument } from '@bunizao/contracts';

const SITE_NAME = 'Bunizao';
const DESCRIPTION_MAX_LENGTH = 220;

export interface MoodDetailMetadata {
  title: string;
  description: string;
  image?: string;
  imageAlt?: string;
  imageWidth?: number | null;
  imageHeight?: number | null;
}

function compactText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function truncateDescription(value: string): string {
  const characters = Array.from(value);
  if (characters.length <= DESCRIPTION_MAX_LENGTH) {
    return value;
  }

  return characters.slice(0, DESCRIPTION_MAX_LENGTH).join('').trim();
}

function getMoodLabel(id: string | undefined): string {
  return id ? `Mood #${id}` : 'Mood';
}

function getShareableImageUrl(value: string | null): string | undefined {
  const trimmed = value?.trim() ?? '';
  if (!trimmed || /^(data:|blob:)/i.test(trimmed)) {
    return undefined;
  }

  return trimmed;
}

function getBookmarkDescription(content: string): string {
  if (!content.includes('bookmark-card__description')) {
    return '';
  }

  const $ = cheerio.load(content);
  return compactText($('.bookmark-card__description').first().text());
}

function htmlToText(html: string): string {
  if (!html) return '';
  const $ = cheerio.load(html);
  return compactText($.text());
}

function firstShareableImage(document: MoodContentDocument): MediaItem | null {
  const candidates = [
    document.hero,
    ...document.media,
  ];
  return candidates.find((item) =>
    item
    && (item.type === 'image' || item.type === 'sticker')
    && (item.src || item.fallbackSrc)
  ) ?? null;
}

export function buildMoodDetailMetadata(
  post: MoodContentDocument | null,
  id: string | undefined
): MoodDetailMetadata {
  if (!post) {
    return {
      title: 'Mood not found | Moods',
      description: 'Mood not found.',
    };
  }

  const moodLabel = getMoodLabel(id);
  const summary = compactText(
    getBookmarkDescription(post.bodyHtml)
    || post.previewText
    || htmlToText(post.bodyHtml)
    || post.title
    || ''
  );
  const description = summary
    ? truncateDescription(summary)
    : `${moodLabel} from ${SITE_NAME}.`;
  const imageMeta = firstShareableImage(post);
  const image = getShareableImageUrl(imageMeta?.src ?? null)
    ?? getShareableImageUrl(imageMeta?.fallbackSrc ?? null);
  const hasImageDimensions = Boolean(image && imageMeta?.width && imageMeta?.height);

  return {
    title: `${moodLabel} | ${SITE_NAME}`,
    description,
    image,
    imageAlt: image ? description : undefined,
    imageWidth: image ? (hasImageDimensions ? imageMeta?.width ?? null : null) : undefined,
    imageHeight: image ? (hasImageDimensions ? imageMeta?.height ?? null : null) : undefined,
  };
}
