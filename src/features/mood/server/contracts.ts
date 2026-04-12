import type { MoodGallery } from '@/features/mood/shared/gallery';
import type {
  ForwardedFromData,
  MoodImageLayout,
  QuoteData,
  ReactionData,
} from '@/lib/mood-utils';

export type MoodReaction = ReactionData;
export type MoodForwardedFrom = ForwardedFromData;
export type MoodQuote = QuoteData;

export interface MoodChannelSummary {
  slug?: string;
  title?: string;
  titleHTML?: string;
  emojiId?: string;
  avatar?: string;
  description?: string;
  descriptionHTML?: string;
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
  mediaHtml: string;
  needsDetailPage: boolean;
  forwardedFrom: MoodForwardedFrom | null;
  quote: MoodQuote | null;
  reactions: MoodReaction[];
  commentsCount: number | string;
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
