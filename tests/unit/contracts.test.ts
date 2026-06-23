import { describe, expect, test } from 'bun:test';
import { CONTENT_DOCUMENT_SOURCES, MOOD_AI_MODELS, MOOD_SENTIMENT_LABELS, NOTIFY_CHANNELS } from '@bunizao/contracts';
import type {
  ContentDocument,
  MoodAiConfig,
  MoodFeedQuery,
  MoodFeedResponse,
  MoodIngestHealth,
  MoodSearchResult,
  MoodSentiment,
  MoodStatsSnapshot,
  SubscriberRecord,
} from '@bunizao/contracts';

describe('@bunizao/contracts', () => {
  test('exports stable content source and notify channel constants', () => {
    expect(CONTENT_DOCUMENT_SOURCES).toEqual(['mood', 'post']);
    expect(NOTIFY_CHANNELS).toEqual(['mood', 'blog', 'privacy', 'announcement']);
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

  test('exports mood analytics and AI contracts', () => {
    const sentiment = {
      label: 'calm',
      score: 0.2,
      model: 'gpt-5.5',
      at: '2026-06-18T10:00:00.000Z',
    } satisfies MoodSentiment;

    const snapshot = {
      activity: [{ date: '2026-06-18', count: 4 }],
      rhythm: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0)),
      sentimentTimeline: [{
        bucketStart: '2026-06-15',
        avgValence: 0.42,
        dominantLabel: 'calm',
        scoredCount: 12,
      }],
      streaks: { current: 12, longest: 30 },
      media: { text: 10, photo: 5, video: 1, other: 0 },
      totals: {
        posts: 3000,
        firstPostAt: '2026-01-01T00:00:00.000Z',
        lastPostAt: '2026-06-18T10:00:00.000Z',
      },
      generatedAt: '2026-06-18T10:00:00.000Z',
    } satisfies MoodStatsSnapshot;

    const aiConfig = {
      primary: 'gpt-5.5',
      fallback: 'claude-sonnet-4.6',
      updatedAt: '2026-06-18T10:00:00.000Z',
    } satisfies MoodAiConfig;

    const health = {
      lastIngested: { id: '3568', datetime: '2026-06-18T10:00:00.000Z' },
      liveLatest: { id: '3569' },
      drift: { messages: 1, seconds: null },
      coverage: {
        sentiment: { total: 100, covered: 80, percent: 80 },
        tags: { total: 100, covered: 70, percent: 70 },
      },
      snapshotGeneratedAt: snapshot.generatedAt,
    } satisfies MoodIngestHealth;

    const searchResult = {
      id: '3568',
      datetime: '2026-06-18T10:00:00.000Z',
      snippet: 'Matched mood text',
      tags: ['travel'],
      sentiment_label: 'calm',
    } satisfies MoodSearchResult;

    const query = {
      tag: 'travel',
      limit: 20,
    } satisfies MoodFeedQuery;

    // @ts-expect-error unknown sentiment labels must stay out of the shared API.
    const invalidSentiment: MoodSentiment = { ...sentiment, label: 'excited' };
    const customConfig: MoodAiConfig = { ...aiConfig, primary: 'local/model-name' };

    expect(MOOD_SENTIMENT_LABELS).toEqual(['joy', 'calm', 'melancholy', 'anger', 'anxiety', 'neutral']);
    expect(MOOD_AI_MODELS).toEqual(['gpt-5.5', 'gpt-5', 'claude-sonnet-4.6']);
    expect(sentiment.label).toBe('calm');
    expect(health.coverage.tags.covered).toBe(70);
    expect(searchResult.tags).toEqual(['travel']);
    expect(query.tag).toBe('travel');
    void invalidSentiment;
    expect(customConfig.primary).toBe('local/model-name');
  });
});
