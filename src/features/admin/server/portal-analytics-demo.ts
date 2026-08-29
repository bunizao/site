import type {
  BlogAnalyticsEventRecord,
  ListeningAnalyticsDailyStats,
  ListeningAnalyticsSummary,
  ListeningAnalyticsSurfaceStats,
  ListeningAnalyticsTrackStats,
} from '@bunizao/contracts';
import type { PortalAnalytics } from './portal-client';

// Local-dev fixture for the analytics page, mirroring the overview demo. Gives
// the charts, tables, and breakdowns realistic shape when the site-api binding
// is absent. Gated behind import.meta.env.DEV in the page — never shipped.
const DAY_MS = 86_400_000;
const now = Date.now();
const dayISO = (back: number): string => new Date(now - back * DAY_MS).toISOString().slice(0, 10);
const tsISO = (minsBack: number): string => new Date(now - minsBack * 60_000).toISOString();

// Fourteen-day traffic wave.
const VIEWS = [128, 141, 119, 173, 210, 198, 164, 152, 189, 233, 251, 217, 205, 242];
const daily = VIEWS.map((views, i) => ({
  day: dayISO(VIEWS.length - 1 - i),
  views,
  reads: Math.round(views * 0.62),
  uniqueVisitors: Math.round(views * 0.78),
  avgReadMs: 68_000 + (i % 5) * 4_000,
  completionRate: 0.44 + (i % 4) * 0.03,
}));

const newsletterDaily = [
  { day: dayISO(6), sent: 0, opened: 41, clicked: 12 },
  { day: dayISO(5), sent: 1147, opened: 388, clicked: 96 },
  { day: dayISO(4), sent: 0, opened: 205, clicked: 61 },
  { day: dayISO(3), sent: 0, opened: 92, clicked: 24 },
  { day: dayISO(2), sent: 0, opened: 47, clicked: 11 },
  { day: dayISO(1), sent: 0, opened: 22, clicked: 6 },
  { day: dayISO(0), sent: 0, opened: 9, clicked: 2 },
];

function event(over: Partial<BlogAnalyticsEventRecord> & Pick<BlogAnalyticsEventRecord, 'eventId' | 'slug'>): BlogAnalyticsEventRecord {
  return {
    visitorId: 'v_demo',
    sessionId: null,
    openedAt: tsISO(12),
    dwellMs: 74_000,
    scrollDepth: 0.72,
    completed: true,
    ip: '203.0.113.7',
    country: 'AU',
    region: 'VIC',
    city: 'Melbourne',
    asn: 13335,
    asOrg: 'Cloudflare',
    colo: 'MEL',
    ua: null,
    browser: 'Safari',
    os: 'macOS',
    deviceType: 'desktop',
    platform: 'safari',
    lang: 'en',
    referrer: null,
    refSource: 'direct',
    createdAt: tsISO(12),
    updatedAt: tsISO(12),
    ...over,
  };
}

// Eight-day listening wave, small enough that the section stays obviously demo
// data while still exercising the stat cards, chart, surfaces, and tracks table.
const LISTENING_PLAYS = [12, 18, 15, 21, 26, 24, 19, 23];
const listeningDaily: ListeningAnalyticsDailyStats[] = LISTENING_PLAYS.map((plays, i) => {
  const requests = plays + Math.round(plays * 0.35);
  const uniqueListeners = Math.round(plays * 0.72);
  const totalListenedMs = plays * 118_000;
  return {
    day: dayISO(LISTENING_PLAYS.length - 1 - i),
    requests,
    plays,
    uniqueListeners,
    totalListenedMs,
    avgListenedMs: Math.round(totalListenedMs / Math.max(1, plays)),
    completionRate: 0.4 + (i % 4) * 0.05,
  };
});

const listeningTracks: ListeningAnalyticsTrackStats[] = [
  { trackId: 't1', trackTitle: 'Nightdrive', trackArtist: 'Kavinsky', requests: 88, plays: 74, uniqueListeners: 61, totalListenedMs: 74 * 148_000, avgListenedMs: 148_000, completionRate: 0.58 },
  { trackId: 't2', trackTitle: 'Weightless', trackArtist: 'Marconi Union', requests: 61, plays: 52, uniqueListeners: 44, totalListenedMs: 52 * 210_000, avgListenedMs: 210_000, completionRate: 0.66 },
  { trackId: 't3', trackTitle: 'Static Sea', trackArtist: null, requests: 47, plays: 38, uniqueListeners: 33, totalListenedMs: 38 * 96_000, avgListenedMs: 96_000, completionRate: 0.34 },
  { trackId: 't4', trackTitle: 'Glass Room', trackArtist: 'Yui Sasaki', requests: 29, plays: 22, uniqueListeners: 20, totalListenedMs: 22 * 132_000, avgListenedMs: 132_000, completionRate: 0.41 },
];

const listeningSurfaces: ListeningAnalyticsSurfaceStats[] = [
  { surface: 'home', requests: 108, plays: 89, uniqueListeners: 71, totalListenedMs: 89 * 121_000, avgListenedMs: 121_000, completionRate: 0.51 },
  { surface: 'blog', requests: 67, plays: 54, uniqueListeners: 46, totalListenedMs: 54 * 138_000, avgListenedMs: 138_000, completionRate: 0.47 },
  { surface: 'mood', requests: 33, plays: 26, uniqueListeners: 22, totalListenedMs: 26 * 104_000, avgListenedMs: 104_000, completionRate: 0.38 },
  { surface: 'components', requests: 9, plays: 7, uniqueListeners: 6, totalListenedMs: 7 * 88_000, avgListenedMs: 88_000, completionRate: 0.29 },
];

const listening: ListeningAnalyticsSummary = {
  totals: {
    requests: listeningDaily.reduce((sum, d) => sum + d.requests, 0),
    plays: listeningDaily.reduce((sum, d) => sum + d.plays, 0),
    uniqueListeners: 148,
    totalListenedMs: listeningDaily.reduce((sum, d) => sum + d.totalListenedMs, 0),
    avgListenedMs: 118_000,
    completionRate: 0.47,
  },
  tracks: listeningTracks,
  surfaces: listeningSurfaces,
  daily: listeningDaily,
  recent: [],
};

export const DEMO_ANALYTICS: PortalAnalytics = {
  summary: {
    range: { from: dayISO(13), to: dayISO(0), days: 14 },
    totals: {
      views: 2612,
      reads: 1619,
      uniqueVisitors: 2037,
      avgReadMs: 74_000,
      avgVisitorReadMs: 96_000,
      completionRate: 0.51,
    },
    articles: [
      { slug: 'on-quiet-software', views: 812, reads: 559, uniqueVisitors: 648, avgReadMs: 132_000, avgVisitorReadMs: 148_000, completionRate: 0.61, topPlatform: 'safari' },
      { slug: 'a-year-of-mood', views: 604, reads: 372, uniqueVisitors: 501, avgReadMs: 88_000, avgVisitorReadMs: 101_000, completionRate: 0.49, topPlatform: 'chrome' },
      { slug: 'building-the-portal', views: 421, reads: 244, uniqueVisitors: 355, avgReadMs: 71_000, avgVisitorReadMs: 82_000, completionRate: 0.44, topPlatform: 'wechat' },
      { slug: 'notes-on-typography', views: 318, reads: 201, uniqueVisitors: 274, avgReadMs: 64_000, avgVisitorReadMs: 73_000, completionRate: 0.52, topPlatform: 'firefox' },
    ],
    platforms: [
      { key: 'safari', views: 1043, reads: 651 },
      { key: 'chrome', views: 782, reads: 498 },
      { key: 'wechat', views: 401, reads: 233 },
      { key: 'firefox', views: 214, reads: 141 },
      { key: 'edge', views: 172, reads: 96 },
    ],
    countries: [
      { key: 'AU', label: 'Australia', views: 918, reads: 601 },
      { key: 'CN', label: 'China', views: 704, reads: 402 },
      { key: 'US', label: 'United States', views: 512, reads: 340 },
      { key: 'JP', label: 'Japan', views: 268, reads: 171 },
      { key: 'GB', label: 'United Kingdom', views: 210, reads: 105 },
    ],
    referrers: [
      { key: 'direct', views: 1187, reads: 762 },
      { key: 'telegram', views: 623, reads: 411 },
      { key: 'search', views: 498, reads: 288 },
      { key: 'twitter', views: 214, reads: 118 },
      { key: 'internal', views: 90, reads: 40 },
    ],
    daily,
    newsletter: {
      totals: { sent: 1147, opened: 804, clicked: 212, uniqueSubscribers: 1147, openRate: 0.7, clickRate: 0.18 },
      byEmailType: [
        { key: 'blog_newsletter', label: 'Blog newsletter', sent: 1147, opened: 804, clicked: 212, uniqueSubscribers: 1147, openRate: 0.7, clickRate: 0.18 },
      ],
      campaigns: [
        { campaignId: 'jul-dispatch', emailType: 'blog_newsletter', sent: 1147, opened: 804, clicked: 212, uniqueSubscribers: 1147, openRate: 0.7, clickRate: 0.18, lastEventAt: tsISO(55) },
        { campaignId: 'jun-recap', emailType: 'blog_newsletter', sent: 1103, opened: 712, clicked: 168, uniqueSubscribers: 1103, openRate: 0.65, clickRate: 0.15, lastEventAt: tsISO(4320) },
        { campaignId: 'welcome', emailType: 'blog_welcome', sent: 214, opened: 191, clicked: 88, uniqueSubscribers: 214, openRate: 0.89, clickRate: 0.41, lastEventAt: tsISO(180) },
      ],
      daily: newsletterDaily,
    },
    listening,
  },
  events: {
    events: [
      event({ eventId: 'e1', slug: 'on-quiet-software', refSource: 'telegram', platform: 'chrome', os: 'Windows', browser: 'Chrome', deviceType: 'desktop', country: 'CN', city: 'Shanghai' }),
      event({ eventId: 'e2', slug: 'a-year-of-mood', refSource: 'direct', platform: 'safari', deviceType: 'mobile', dwellMs: 41_000, scrollDepth: 0.55, completed: false, openedAt: tsISO(38), createdAt: tsISO(38) }),
      event({ eventId: 'e3', slug: 'building-the-portal', refSource: 'search', platform: 'wechat', os: 'iOS', browser: 'WeChat', deviceType: 'mobile', country: 'CN', openedAt: tsISO(96), createdAt: tsISO(96) }),
      event({ eventId: 'e4', slug: 'notes-on-typography', refSource: 'twitter', platform: 'firefox', os: 'Linux', browser: 'Firefox', country: 'US', city: 'Austin', openedAt: tsISO(190), createdAt: tsISO(190) }),
    ],
  },
};
