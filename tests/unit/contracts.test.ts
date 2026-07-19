import { describe, expect, test } from 'bun:test';
import {
  BLOG_ANALYTICS_COMPLETION_SCROLL_DEPTH,
  BLOG_ANALYTICS_EVENT_ENDPOINT,
  BLOG_ANALYTICS_EVENTS_ENDPOINT,
  BLOG_ANALYTICS_READ_THRESHOLD_MS,
  BLOG_ANALYTICS_SUMMARY_ENDPOINT,
  CONTENT_DOCUMENT_SOURCES,
  MOOD_ARCHIVE_FEED_PATH,
  MOOD_LIVE_COUNTS_PATH,
  MOOD_LIVE_FEED_PATH,
  MOOD_MEDIA_PROXY_BASE_PATH,
  NEWSLETTER_ANALYTICS_CLICK_ENDPOINT,
  NEWSLETTER_ANALYTICS_OPEN_ENDPOINT,
  NOTIFY_CHANNELS,
  TELEGRAM_WEBHOOK_PATH,
} from '@bunizao/contracts';
import type {
  BlogAnalyticsEventInput,
  BlogAnalyticsEventsResult,
  BlogAnalyticsSummaryResult,
  ContentDocument,
  MoodFeedResponse,
  NewsletterAnalyticsSummary,
  SubscriberRecord,
} from '@bunizao/contracts';

describe('@bunizao/contracts', () => {
  test('exports stable content source and notify channel constants', () => {
    expect(CONTENT_DOCUMENT_SOURCES).toEqual(['mood', 'post']);
    expect(NOTIFY_CHANNELS).toEqual(['mood', 'blog', 'privacy', 'announcement']);
  });

  test('exports shared route constants', () => {
    expect(MOOD_LIVE_FEED_PATH).toBe('/v1/mood');
    expect(MOOD_ARCHIVE_FEED_PATH).toBe('/v2/mood');
    expect(MOOD_LIVE_COUNTS_PATH).toBe('/v2/moods/live-counts');
    expect(MOOD_MEDIA_PROXY_BASE_PATH).toBe('/v2/media');
    expect(TELEGRAM_WEBHOOK_PATH).toBe('/webhooks/telegram');
  });

  test('accepts mood and post content documents under one DTO shape', () => {
    const mood = {
      id: '123',
      source: 'mood',
      datetime: '2026-06-13T00:00:00.000Z',
      bodyHtml: '<p>hello</p>',
      media: [
        {
          type: 'link-preview',
          href: 'https://example.com/story',
          title: 'Example story',
          description: 'A structured link preview.',
          siteName: 'Example',
          linkPreviewLayout: 'large',
        },
        {
          type: 'location',
          title: 'Kuala Lumpur',
        },
      ],
      reactions: [],
      commentsCount: 0,
    } satisfies ContentDocument;

    const post = {
      id: 'hello-world',
      source: 'post',
      slug: 'hello-world',
      title: 'Hello world',
      datetime: '2026-06-13T00:00:00.000Z',
      excerpt: 'A placeholder post contract.',
      bodyHtml: '<p>coming soon</p>',
      media: [],
    } satisfies ContentDocument;

    expect(mood.source).toBe('mood');
    expect(post.source).toBe('post');
  });

  test('keeps existing mood and notify response contracts importable', () => {
    const feed = {
      posts: [],
      channel: {
        slug: 'tutumood',
      },
    } satisfies MoodFeedResponse;

    const subscriber = {
      email: 'reader@example.com',
      emailHash: 'hash',
      status: 'active',
      channels: ['mood'],
      createdAt: '2026-06-13T00:00:00.000Z',
      updatedAt: '2026-06-13T00:00:00.000Z',
    } satisfies SubscriberRecord;

    expect(feed.channel.slug).toBe('tutumood');
    expect(subscriber.channels).toEqual(['mood']);
  });

  test('exports blog analytics event and dashboard contracts', () => {
    expect(BLOG_ANALYTICS_EVENT_ENDPOINT).toBe('/api/analytics/event');
    expect(BLOG_ANALYTICS_SUMMARY_ENDPOINT).toBe('/api/analytics/summary');
    expect(BLOG_ANALYTICS_EVENTS_ENDPOINT).toBe('/api/analytics/events');
    expect(NEWSLETTER_ANALYTICS_OPEN_ENDPOINT).toBe('/api/analytics/newsletter/open');
    expect(NEWSLETTER_ANALYTICS_CLICK_ENDPOINT).toBe('/api/analytics/newsletter/click');
    expect(BLOG_ANALYTICS_READ_THRESHOLD_MS).toBe(5_000);
    expect(BLOG_ANALYTICS_COMPLETION_SCROLL_DEPTH).toBe(0.9);

    const event = {
      eventId: '019f2fa9-7c7b-7000-9000-000000000001',
      slug: 'hello-world',
      visitorId: '019f2fa9-7c7b-7000-9000-000000000002',
      sessionId: '019f2fa9-7c7b-7000-9000-000000000003',
      dwellMs: 12_000,
      scrollDepth: 0.84,
      completed: false,
      referrer: 'https://buxx.me/blog',
    } satisfies BlogAnalyticsEventInput;

    const summary = {
      range: { from: '2026-06-01', to: '2026-06-27', days: 27 },
      totals: {
        views: 10,
        reads: 8,
        uniqueVisitors: 4,
        avgReadMs: 15_000,
        avgVisitorReadMs: 30_000,
        completionRate: 0.7,
      },
      articles: [
        {
          slug: 'hello-world',
          views: 10,
          reads: 8,
          uniqueVisitors: 4,
          avgReadMs: 15_000,
          avgVisitorReadMs: 30_000,
          completionRate: 0.7,
          topPlatform: 'safari',
        },
      ],
      platforms: [{ key: 'safari', views: 6, reads: 5, uniqueVisitors: 3 }],
      countries: [{ key: 'US', label: 'United States', views: 4, reads: 3 }],
      referrers: [{ key: 'direct', views: 5, reads: 4 }],
      newsletter: {
        totals: {
          sent: 3,
          opened: 2,
          clicked: 1,
          uniqueSubscribers: 3,
          openRate: 2 / 3,
          clickRate: 1 / 3,
        },
        byEmailType: [{ key: 'blog_newsletter', sent: 3, opened: 2, clicked: 1, uniqueSubscribers: 3, openRate: 2 / 3, clickRate: 1 / 3 }],
        campaigns: [
          {
            campaignId: 'blog:hello-world',
            emailType: 'blog_newsletter',
            postId: 'hello-world',
            sent: 3,
            opened: 2,
            clicked: 1,
            uniqueSubscribers: 3,
            openRate: 2 / 3,
            clickRate: 1 / 3,
            lastEventAt: '2026-06-27T08:00:00.000Z',
          },
        ],
        daily: [{ day: '2026-06-27', sent: 3, opened: 2, clicked: 1 }],
      } satisfies NewsletterAnalyticsSummary,
      daily: [
        {
          day: '2026-06-27',
          views: 10,
          reads: 8,
          uniqueVisitors: 4,
          avgReadMs: 15_000,
          completionRate: 0.7,
        },
      ],
    } satisfies BlogAnalyticsSummaryResult;

    const events = {
      events: [
        {
          eventId: event.eventId,
          slug: event.slug,
          visitorId: event.visitorId,
          sessionId: event.sessionId,
          openedAt: '2026-06-27T08:00:00.000Z',
          dwellMs: event.dwellMs,
          scrollDepth: event.scrollDepth,
          completed: event.completed,
          ip: '203.0.113.10',
          country: 'US',
          region: 'California',
          city: 'San Francisco',
          asn: 13335,
          asOrg: 'Cloudflare',
          colo: 'SFO',
          ua: 'Mozilla/5.0 Safari/605.1.15',
          browser: 'safari',
          os: 'ios',
          deviceType: 'mobile',
          platform: 'safari',
          lang: 'en-US',
          referrer: event.referrer,
          refSource: 'internal',
          createdAt: '2026-06-27T08:00:00.000Z',
          updatedAt: '2026-06-27T08:00:12.000Z',
        },
      ],
      total: 1,
      nextCursor: null,
    } satisfies BlogAnalyticsEventsResult;

    expect(summary.articles[0].topPlatform).toBe('safari');
    expect(summary.newsletter?.campaigns[0]?.emailType).toBe('blog_newsletter');
    expect(events.events[0].refSource).toBe('internal');
  });
});
