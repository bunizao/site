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
  LISTENING_ANALYTICS_EVENT_ENDPOINT,
  NEWSLETTER_ANALYTICS_CLICK_ENDPOINT,
  NEWSLETTER_ANALYTICS_OPEN_ENDPOINT,
  NOTIFY_CHANNELS,
  TELEGRAM_WEBHOOK_PATH,
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

  test('pins the analytics endpoints and thresholds site-api serves', () => {
    expect(BLOG_ANALYTICS_EVENT_ENDPOINT).toBe('/api/analytics/event');
    expect(BLOG_ANALYTICS_SUMMARY_ENDPOINT).toBe('/api/analytics/summary');
    expect(BLOG_ANALYTICS_EVENTS_ENDPOINT).toBe('/api/analytics/events');
    expect(NEWSLETTER_ANALYTICS_OPEN_ENDPOINT).toBe('/api/analytics/newsletter/open');
    expect(NEWSLETTER_ANALYTICS_CLICK_ENDPOINT).toBe('/api/analytics/newsletter/click');
    expect(LISTENING_ANALYTICS_EVENT_ENDPOINT).toBe('/api/v2/analytics/listening');
    expect(BLOG_ANALYTICS_READ_THRESHOLD_MS).toBe(5_000);
    expect(BLOG_ANALYTICS_COMPLETION_SCROLL_DEPTH).toBe(0.9);
  });
});
