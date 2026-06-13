import { describe, expect, test } from 'bun:test';
import { CONTENT_DOCUMENT_SOURCES, NOTIFY_CHANNELS } from '@bunizao/contracts';
import type { ContentDocument, MoodFeedResponse, SubscriberRecord } from '@bunizao/contracts';

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
      media: [],
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
});
