export const BLOG_ANALYTICS_EVENT_ENDPOINT = '/api/analytics/event' as const;
export const BLOG_ANALYTICS_SUMMARY_ENDPOINT = '/api/analytics/summary' as const;
export const BLOG_ANALYTICS_EVENTS_ENDPOINT = '/api/analytics/events' as const;
export const BLOG_ANALYTICS_ARTICLE_ENDPOINT = '/api/analytics/article' as const;
export const NEWSLETTER_ANALYTICS_OPEN_ENDPOINT = '/api/analytics/newsletter/open' as const;
export const NEWSLETTER_ANALYTICS_CLICK_ENDPOINT = '/api/analytics/newsletter/click' as const;
export const LISTENING_ANALYTICS_EVENT_ENDPOINT = '/api/v2/analytics/listening' as const;
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
export type ListeningAnalyticsAction = 'play_request' | 'play' | 'progress' | 'pause' | 'seek' | 'complete';
export type ListeningAnalyticsSurface = 'home' | 'blog' | 'mood' | 'components' | 'other';

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

export interface ListeningAnalyticsEventInput {
  playbackId: string;
  visitorId: string;
  sessionId?: string | null;
  action: ListeningAnalyticsAction;
  trackId?: string | null;
  trackTitle: string;
  trackArtist?: string | null;
  pagePath: string;
  surface: ListeningAnalyticsSurface;
  listenedMs: number;
  mediaTimeMs: number;
  durationMs: number;
  requestCount: number;
  playCount: number;
  pauseCount: number;
  seekCount: number;
  completed: boolean;
}

export interface ListeningAnalyticsTotals {
  requests: number;
  plays: number;
  uniqueListeners: number;
  totalListenedMs: number;
  avgListenedMs: number;
  completionRate: number;
}

export interface ListeningAnalyticsTrackStats extends ListeningAnalyticsTotals {
  trackId: string | null;
  trackTitle: string;
  trackArtist: string | null;
}

export interface ListeningAnalyticsSurfaceStats extends ListeningAnalyticsTotals {
  surface: ListeningAnalyticsSurface;
}

export interface ListeningAnalyticsDailyStats extends ListeningAnalyticsTotals {
  day: string;
}

export interface ListeningAnalyticsSessionRecord extends ListeningAnalyticsEventInput {
  startedAt: string;
  lastEventAt: string;
  ip: string | null;
  country: string | null;
  city: string | null;
  browser: string | null;
  os: string | null;
  deviceType: BlogAnalyticsDeviceType | null;
  platform: BlogAnalyticsPlatform;
}

export interface ListeningAnalyticsSummary {
  totals: ListeningAnalyticsTotals;
  tracks: ListeningAnalyticsTrackStats[];
  surfaces: ListeningAnalyticsSurfaceStats[];
  daily: ListeningAnalyticsDailyStats[];
  recent: ListeningAnalyticsSessionRecord[];
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
  listening?: ListeningAnalyticsSummary;
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

export const SITE_ANALYTICS_COLLECT_ENDPOINT = '/api/analytics/collect' as const;
export const SITE_ANALYTICS_REPORT_ENDPOINT = '/api/analytics/site' as const;
export const SITE_ANALYTICS_ENGAGED_DWELL_MS = 10_000;
export const SITE_ANALYTICS_SESSION_IDLE_MS = 30 * 60_000;
export const SITE_ANALYTICS_SURFACES = [
  'home', 'legacy', 'not_found', 'blog_index', 'blog_tags', 'blog_tag', 'blog_post',
  'mood_feed', 'mood_post', 'mood_embed', 'projects', 'message', 'privacy',
  'subscribe_manage', 'reader', 'docs', 'components', 'other',
] as const;
export type SiteAnalyticsSurface = typeof SITE_ANALYTICS_SURFACES[number];
export type SiteAnalyticsClickKind = 'link_internal' | 'link_outbound' | 'button' | 'panel';
export type SiteAnalyticsTrafficClass = 'human' | 'bot' | 'owner';
export interface SiteAnalyticsClick {
  name: string; kind: SiteAnalyticsClickKind; href: string; region: string;
  label: string; position: number; tMs: number;
}
export interface SiteAnalyticsCollectInput {
  v: 1; viewId: string; visitorId: string; sessionId: string; seq: number; owner?: true;
  page: {
    surface: SiteAnalyticsSurface; entity: string; path: string; locale: string;
    referrer: string; utm: [string, string, string];
  };
  client: {
    tz: string; langs: string[]; vw: number; vh: number; dpr: number;
    navType: 0 | 1 | 2 | 3; isEntry: boolean; isNewVisitor: boolean; webdriver: boolean;
  };
  progress: {
    dwellMs: number; scrollDepth: number; interactions: number; firstInputMs: number;
    hiddenCount: number; metric1: number; metric2: number;
  };
  clicks: SiteAnalyticsClick[];
}
export const SITE_ANALYTICS_REPORTS = ['overview', 'pages', 'clicks', 'sources', 'audience', 'quality', 'log', 'visitor'] as const;
export type SiteAnalyticsReportName = typeof SITE_ANALYTICS_REPORTS[number];
export interface SiteAnalyticsMetrics {
  views: number; engaged: number; visitors: number; sessions: number; bounces: number;
  entries: number; exits: number; reads: number; completions: number; clicks: number;
  medianDwellMs: number; scrollDepth: number; metric1: number; metric2: number;
}
export interface SiteAnalyticsPageRow extends SiteAnalyticsMetrics {
  day: string; surface: string; entity: string;
}
export interface SiteAnalyticsClickRow {
  day: string; surface: string; entity: string; name: string; href: string;
  clicks: number; visitors: number; medianTimeMs: number | null; clickThrough: number;
}
export interface SiteAnalyticsDimensionRow {
  day: string; surface: string; dim: string; key: string;
  views: number; visitors: number; engaged: number; dwellMsSum: number;
}
export interface SiteAnalyticsTrafficRow {
  day: string; surface: string; class: SiteAnalyticsTrafficClass; reason: string;
  views: number; visitors: number;
}
export interface SiteAnalyticsViewRecord {
  viewId: string; visitorId: string; sessionId: string; startedAt: string; updatedAt: string;
  class: SiteAnalyticsTrafficClass; reason: string; weight: number;
  page: SiteAnalyticsCollectInput['page']; client: SiteAnalyticsCollectInput['client'];
  progress: SiteAnalyticsCollectInput['progress']; clicks: SiteAnalyticsClick[];
  country: string; region: string; city: string; ip: string; ua: string;
  browser: string; os: string; device: string; platform: string; network: string;
  refSource: string; refHost: string; clickCount: number;
}
export interface SiteAnalyticsReportResult {
  report: SiteAnalyticsReportName; from: string; to: string; timezone: 'Australia/Melbourne';
  sampled: boolean; visitors: number | null;
  visitorBasis: 'distinct' | 'sampled_distinct' | 'sum_monthly' | 'unavailable';
  pages: SiteAnalyticsPageRow[]; clicks: SiteAnalyticsClickRow[];
  dimensions: SiteAnalyticsDimensionRow[]; traffic: SiteAnalyticsTrafficRow[];
  events: SiteAnalyticsViewRecord[]; nextCursor: string | null;
  rum: Array<{ surface: string; loads: number }> | null;
  notices: string[];
}
