export const CONTENT_DOCUMENT_SOURCES = ['mood', 'post'] as const;

export type ContentDocumentSource = (typeof CONTENT_DOCUMENT_SOURCES)[number];
export type ContentMediaType =
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'embed'
  | 'sticker'
  | 'link-preview'
  | 'location'
  | 'poll';
export type ContentMediaLayout = 'landscape' | 'portrait' | 'ultra-tall';

export interface MediaItem {
  id?: string;
  type: ContentMediaType;
  src?: string;
  href?: string;
  fallbackSrc?: string | null;
  posterSrc?: string | null;
  thumbnailSrc?: string | null;
  width?: number | null;
  height?: number | null;
  layout?: ContentMediaLayout | null;
  alt?: string;
  title?: string;
  description?: string;
  siteName?: string;
  fileName?: string;
  fileSizeLabel?: string;
  mimeType?: string;
  durationSeconds?: number | null;
  originalUrl?: string;
}

export interface Reaction {
  emoji: string;
  emojiId?: string;
  emojiImage?: string;
  count: string;
  isPaid: boolean;
}

export interface ForwardedFrom {
  name: string;
  href?: string;
  author?: string;
}

export interface QuoteRef {
  text: string;
  author?: string;
  href?: string;
  thumbnailSrc?: string;
}

export interface ContentDocument {
  id: string;
  source: ContentDocumentSource;
  datetime: string;
  updatedAt?: string;
  url?: string;
  slug?: string;
  title?: string;
  excerpt?: string;
  tag?: string;
  tags?: string[];
  bodyHtml: string;
  previewText?: string;
  previewHtml?: string;
  hero?: MediaItem | null;
  media: MediaItem[];
  forwardedFrom?: ForwardedFrom | null;
  quote?: QuoteRef | null;
  reactions?: Reaction[];
  commentsCount?: number | string;
}

export interface MoodContentDocument extends ContentDocument {
  source: 'mood';
  channel?: ContentChannelSummary;
}

export interface PostContentDocument extends ContentDocument {
  source: 'post';
  title: string;
  slug: string;
}

export interface ContentChannelSummary {
  slug?: string;
  title?: string;
  titleHTML?: string;
  emojiId?: string;
  avatar?: string;
  description?: string;
  descriptionHTML?: string;
}
