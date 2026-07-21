export const BLOG_ANALYTICS_EVENT_ENDPOINT = '/api/analytics/event' as const;
export const BLOG_ANALYTICS_SUMMARY_ENDPOINT = '/api/analytics/summary' as const;
export const BLOG_ANALYTICS_EVENTS_ENDPOINT = '/api/analytics/events' as const;
export const BLOG_ANALYTICS_ARTICLE_ENDPOINT = '/api/analytics/article' as const;
export const NEWSLETTER_ANALYTICS_OPEN_ENDPOINT = '/api/analytics/newsletter/open' as const;
export const NEWSLETTER_ANALYTICS_CLICK_ENDPOINT = '/api/analytics/newsletter/click' as const;
export const BLOG_ANALYTICS_EVENTS_DEFAULT_LIMIT = 50;
export const BLOG_ANALYTICS_READ_THRESHOLD_MS = 5_000;
export const BLOG_ANALYTICS_COMPLETION_SCROLL_DEPTH = 0.9;
export const BLOG_ANALYTICS_RANGE_OPTIONS = [7, 30, 90] as const;

export type BlogAnalyticsPlatform =
  | 'wechat'
  | 'wechat_mini'
  | 'weibo'
  | 'qq'
  | 'dingtalk'
  | 'edge'
  | 'chrome'
  | 'firefox'
  | 'safari'
  | 'other'
  | (string & {});

export type BlogAnalyticsRefSource =
  | 'direct'
  | 'telegram'
  | 'search'
  | 'twitter'
  | 'internal'
  | 'external'
  | (string & {});

export type BlogAnalyticsDeviceType = 'mobile' | 'tablet' | 'desktop' | 'other' | (string & {});

export type NewsletterAnalyticsEventType = 'sent' | 'open' | 'click';
export type NewsletterAnalyticsEmailType = 'blog_welcome' | 'blog_newsletter';

export interface BlogAnalyticsEventInput {
  eventId: string;
  slug: string;
  visitorId: string;
  sessionId?: string | null;
  dwellMs: number;
  scrollDepth: number;
  completed: boolean;
  referrer?: string | null;
}

export interface BlogAnalyticsTotals {
  views: number;
  reads: number;
  uniqueVisitors: number;
  avgReadMs: number;
  avgVisitorReadMs: number;
  completionRate: number;
}

export interface BlogAnalyticsArticleStats extends BlogAnalyticsTotals {
  slug: string;
  topPlatform: BlogAnalyticsPlatform | null;
}

export interface BlogAnalyticsBreakdown {
  key: string;
  label?: string;
  views: number;
  reads: number;
  uniqueVisitors?: number;
  avgReadMs?: number;
  completionRate?: number;
}

export interface BlogAnalyticsDailyStats {
  day: string;
  views: number;
  reads: number;
  uniqueVisitors: number;
  avgReadMs: number;
  completionRate: number;
}

export interface NewsletterAnalyticsTotals {
  sent: number;
  opened: number;
  clicked: number;
  uniqueSubscribers: number;
  openRate: number;
  clickRate: number;
}

export interface NewsletterAnalyticsBreakdown extends NewsletterAnalyticsTotals {
  key: string;
  label?: string;
}

export interface NewsletterAnalyticsCampaignStats extends NewsletterAnalyticsTotals {
  campaignId: string;
  emailType: NewsletterAnalyticsEmailType;
  postId?: string | null;
  lastEventAt: string | null;
}

export interface NewsletterAnalyticsDailyStats {
  day: string;
  sent: number;
  opened: number;
  clicked: number;
}

export interface NewsletterAnalyticsSummary {
  totals: NewsletterAnalyticsTotals;
  byEmailType: NewsletterAnalyticsBreakdown[];
  campaigns: NewsletterAnalyticsCampaignStats[];
  daily: NewsletterAnalyticsDailyStats[];
}

export interface BlogAnalyticsSummaryResult {
  range: {
    from: string | null;
    to: string | null;
    days: number;
  };
  totals: BlogAnalyticsTotals;
  articles: BlogAnalyticsArticleStats[];
  platforms: BlogAnalyticsBreakdown[];
  countries: BlogAnalyticsBreakdown[];
  referrers: BlogAnalyticsBreakdown[];
  daily: BlogAnalyticsDailyStats[];
  newsletter?: NewsletterAnalyticsSummary;
}

export interface BlogAnalyticsEventRecord {
  eventId: string;
  slug: string;
  visitorId: string;
  sessionId: string | null;
  openedAt: string;
  dwellMs: number;
  scrollDepth: number;
  completed: boolean;
  ip: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  asn: number | null;
  asOrg: string | null;
  colo: string | null;
  ua: string | null;
  browser: string | null;
  os: string | null;
  deviceType: BlogAnalyticsDeviceType | null;
  platform: BlogAnalyticsPlatform;
  lang: string | null;
  referrer: string | null;
  refSource: BlogAnalyticsRefSource;
  createdAt: string;
  updatedAt: string;
}

export interface BlogAnalyticsEventsResult {
  events: BlogAnalyticsEventRecord[];
  total?: number;
  nextCursor?: string | null;
}

export interface BlogAnalyticsScrollBucket {
  bucket: string;
  count: number;
}

export interface BlogAnalyticsArticleDetailResult {
  slug: string;
  range: {
    from: string | null;
    to: string | null;
    days: number;
  };
  totals: BlogAnalyticsTotals;
  daily: BlogAnalyticsDailyStats[];
  referrers: BlogAnalyticsBreakdown[];
  platforms: BlogAnalyticsBreakdown[];
  countries: BlogAnalyticsBreakdown[];
  scrollBuckets: BlogAnalyticsScrollBucket[];
}
