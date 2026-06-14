import type {
  ContentChannelSummary,
  ContentMediaLayout,
  ForwardedFrom,
  QuoteRef,
  Reaction,
} from './content';

export type MoodImageLayout = ContentMediaLayout;
export type ReactionData = Reaction;
export type ForwardedFromData = ForwardedFrom;
export type QuoteData = QuoteRef;
export type ChannelInfo = ContentChannelSummary;
export type MoodReaction = Reaction;
export type MoodForwardedFrom = ForwardedFrom;
export type MoodQuote = QuoteRef;
export type MoodChannelSummary = ContentChannelSummary;

export interface MoodGalleryItem {
  src: string;
  fallbackSrc: string | null;
  width: number | null;
  height: number | null;
  layout: MoodImageLayout | null;
  alt: string;
}

export interface MoodGallery {
  items: MoodGalleryItem[];
  count: number;
}

export interface MoodFeedItem {
  id: string;
  datetime: string;
  tag: string;
  previewText: string;
  previewHtml: string;
  previewMediaType?: string;
  gallery?: MoodGallery | null;
  image?: string | null;
  imageFallback?: string | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  imageLayout?: MoodImageLayout | null;
  imageKind?: 'sticker' | null;
  mediaHtml: string;
  needsDetailPage: boolean;
  forwardedFrom: MoodForwardedFrom | null;
  quote: MoodQuote | null;
  reactions: MoodReaction[];
  commentsCount: number | string;
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
  imageLayout?: MoodImageLayout | null;
  imageKind?: 'sticker' | null;
  mediaHtml?: string;
  needsDetailPage?: boolean;
  forwardedFrom?: ForwardedFromData | null;
  quote?: QuoteData | null;
  reactions?: ReactionData[];
  commentsCount?: number | string;
}

export interface MoodFeedResponse {
  posts: MoodFeedItem[];
  channel: MoodChannelSummary;
}

export interface MoodProbeResult {
  latestId: string;
}

export interface MoodComment {
  id: string;
  author: string;
  authorAvatar?: string;
  datetime: string;
  content: string;
  reactions: MoodReaction[];
}

export interface MoodCommentsPage {
  comments: MoodComment[];
  hasMore: boolean;
  nextBefore: string;
}
