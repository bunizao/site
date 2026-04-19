import type { MoodGallery } from '@/features/mood/shared/gallery';

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
  thumbnailSrc?: string;
}

export interface ChannelInfo {
  slug?: string;
  title?: string;
  titleHTML?: string;
  emojiId?: string;
  avatar?: string;
  description?: string;
  descriptionHTML?: string;
}

export interface MoodData {
  id: string;
  datetime: string;
  tag?: string;
  previewText: string;
  previewHtml?: string;
  previewMediaType?: string;
  gallery?: MoodGallery | null;
  image?: string | null;
  imageFallback?: string | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  imageLayout?: 'landscape' | 'portrait' | 'ultra-tall' | null;
  mediaHtml?: string;
  needsDetailPage?: boolean;
  forwardedFrom?: ForwardedFromData | null;
  quote?: QuoteData | null;
  reactions?: ReactionData[];
  commentsCount?: number | string;
}
