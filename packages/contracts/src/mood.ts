import type {
  ContentChannelSummary,
  ContentMediaLayout,
  ForwardedFrom,
  MediaItem,
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

export const MOOD_SENTIMENT_LABELS = ['joy', 'calm', 'melancholy', 'anger', 'anxiety', 'neutral'] as const;
export const MOOD_AI_MODELS = ['gpt-5.5', 'gpt-5', 'claude-sonnet-4.6'] as const;

export type MoodSentimentLabel = (typeof MOOD_SENTIMENT_LABELS)[number];
export type MoodAiModel = string;

export interface MoodSentiment {
  label: MoodSentimentLabel;
  score: number;
  model: string;
  at: string;
}

export interface MoodStatsActivityBucket {
  date: string;
  count: number;
}

export interface MoodStatsSentimentBucket {
  bucketStart: string;
  avgValence: number | null;
  dominantLabel: MoodSentimentLabel | null;
  scoredCount: number;
}

export interface MoodStatsSnapshot {
  activity: MoodStatsActivityBucket[];
  rhythm: number[][];
  sentimentTimeline: MoodStatsSentimentBucket[];
  streaks: {
    current: number;
    longest: number;
  };
  media: {
    text: number;
    photo: number;
    video: number;
    other: number;
  };
  totals: {
    posts: number;
    firstPostAt: string | null;
    lastPostAt: string | null;
  };
  generatedAt: string;
}

export interface MoodAiConfig {
  primary: MoodAiModel;
  fallback: MoodAiModel;
  updatedAt: string;
}

export interface MoodCoverageSummary {
  total: number;
  covered: number;
  percent: number;
}

export interface MoodIngestHealth {
  lastIngested: {
    id: string;
    datetime: string;
  } | null;
  liveLatest: {
    id: string;
    datetime?: string;
  } | null;
  drift: {
    messages: number | null;
    seconds: number | null;
  };
  coverage: {
    sentiment: MoodCoverageSummary;
    tags: MoodCoverageSummary;
  };
  replyIntegrity: {
    edges: number;
    unresolvedTargets: number;
    unresolvedPostIds: string[];
    unverifiedPosts: number;
    oldestVerifiedAt: string | null;
  };
  snapshotGeneratedAt: string | null;
}

export interface MoodSearchResult {
  id: string;
  datetime: string;
  snippet: string;
  tags: string[];
  sentiment_label: MoodSentimentLabel | null;
}

export interface MoodSearchResponse {
  results: MoodSearchResult[];
}

export interface MoodFeedQuery {
  before?: string;
  after?: string;
  fresh?: boolean;
  limit?: number;
  tag?: string;
}

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
  groupIds?: string[];
  datetime: string;
  tag: string;
  previewText: string;
  previewHtml: string;
  previewMediaType?: string;
  media: MediaItem[];
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
  groupIds?: string[];
  datetime: string;
  tag?: string;
  previewText: string;
  previewHtml?: string;
  previewMediaType?: string;
  media?: MediaItem[];
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

export interface MoodImageProbe {
  id: string;
  datetime: string;
  url: string | null;
  r2Ready: boolean;
}

export interface MoodImageProbeResponse {
  latestImage: MoodImageProbe | null;
}

export interface MoodMetaItem {
  id: string;
  reactions: MoodReaction[];
  // `null` means the count is unknown (window omitted it and the backfill
  // could not resolve it); clients keep their existing count in that case.
  commentsCount: number | null;
}

export interface MoodLiveCount {
  reactions: MoodReaction[] | null;
  commentsCount: number | null;
}

export interface MoodLiveCountsResponse {
  counts: Record<string, MoodLiveCount>;
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
