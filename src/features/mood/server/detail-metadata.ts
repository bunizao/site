import { getFirstImageMeta, getTextPreview } from '@/features/mood/shared/utils';
import type { Post } from '@/features/mood/server/telegram-source';

const SITE_NAME = 'Bunizao';
const DESCRIPTION_MAX_LENGTH = 160;

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

export function buildMoodDetailMetadata(post: Post | null, id: string | undefined): MoodDetailMetadata {
  if (!post) {
    return {
      title: 'Mood not found | Moods',
      description: 'Mood not found.',
    };
  }

  const moodLabel = getMoodLabel(id);
  const summary = compactText(getTextPreview(post) || post.text || post.title);
  const description = summary
    ? truncateDescription(summary)
    : `${moodLabel} from ${SITE_NAME}.`;
  const imageMeta = getFirstImageMeta(post.content);
  const image = getShareableImageUrl(imageMeta.src) ?? getShareableImageUrl(imageMeta.fallbackSrc);
  const hasImageDimensions = Boolean(image && imageMeta.width && imageMeta.height);

  return {
    title: `${moodLabel} | ${SITE_NAME}`,
    description,
    image,
    imageAlt: image ? description : undefined,
    imageWidth: image ? (hasImageDimensions ? imageMeta.width : null) : undefined,
    imageHeight: image ? (hasImageDimensions ? imageMeta.height : null) : undefined,
  };
}
