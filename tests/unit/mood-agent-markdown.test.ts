import { describe, expect, test } from 'bun:test';
import {
  buildMoodAgentMarkdown,
  buildMoodAgentPostPageMarkdown,
} from '../../src/features/mood/server/serializers';
import type { MoodFeedResponse } from '../../src/features/mood/server/contracts';

describe('buildMoodAgentMarkdown', () => {
  test('renders a compact markdown feed for agents', () => {
    const feed: MoodFeedResponse = {
      channel: {
        title: 'Mood Channel',
      },
      posts: [
        {
          id: '42',
          datetime: '2026-04-30T08:00:00.000Z',
          tag: 'note',
          previewText: 'Line one\nLine two',
          previewHtml: '<p>Line one</p>',
          media: [{
            id: '42-0',
            type: 'image',
            src: '/media/42.jpg',
            fallbackSrc: null,
            width: 1200,
            height: 800,
            layout: 'landscape',
            alt: '',
          }],
          gallery: {
            count: 1,
            items: [
              {
                src: '/media/42.jpg',
                fallbackSrc: null,
                width: 1200,
                height: 800,
                layout: 'landscape',
                alt: '',
              },
            ],
          },
          image: '/media/42.jpg',
          imageFallback: null,
          imageWidth: 1200,
          imageHeight: 800,
          imageLayout: 'landscape',
          imageKind: null,
          mediaHtml: '<img src="/media/42.jpg">',
          needsDetailPage: false,
          forwardedFrom: null,
          quote: {
            text: 'Quoted text',
            href: '/mood/41',
          },
          reactions: [
            {
              emoji: '👍',
              count: '2',
              isPaid: false,
            },
          ],
          commentsCount: 3,
        },
      ],
    };

    const markdown = buildMoodAgentMarkdown(feed, new URL('https://buxx.me'));

    expect(markdown).toContain('# Mood Feed');
    expect(markdown).toContain('JSON: https://buxx.me/api/moods');
    expect(markdown).toContain('Next: https://buxx.me/agent/mood?before=42');
    expect(markdown).toContain('## 42 · 2026-04-30T08:00:00.000Z');
    expect(markdown).toContain('URL: https://buxx.me/mood/42');
    expect(markdown).toContain('Agent: https://buxx.me/agent/mood/42');
    expect(markdown).toContain('> Line one\n> Line two');
    expect(markdown).toContain('Quote: https://buxx.me/mood/41');
    expect(markdown).toContain('Quote text:\n> Quoted text');
    expect(markdown).toContain('- image: https://buxx.me/media/42.jpg (1200x800)');
    expect(markdown).not.toContain('<img');
  });

  test('renders a single mood markdown page', () => {
    const feed: MoodFeedResponse = {
      channel: {},
      posts: [
        {
          id: '43',
          datetime: '2026-04-30T09:00:00.000Z',
          tag: '',
          previewText: 'Single post',
          previewHtml: '',
          media: [],
          gallery: null,
          image: null,
          imageFallback: null,
          imageWidth: null,
          imageHeight: null,
          imageLayout: null,
          imageKind: null,
          mediaHtml: '',
          needsDetailPage: false,
          forwardedFrom: null,
          quote: null,
          reactions: [],
          commentsCount: 0,
        },
      ],
    };

    const markdown = buildMoodAgentPostPageMarkdown(feed.posts[0], new URL('https://buxx.me'));

    expect(markdown).toContain('# 43 · 2026-04-30T09:00:00.000Z');
    expect(markdown).toContain('URL: https://buxx.me/mood/43');
    expect(markdown).toContain('Agent: https://buxx.me/agent/mood/43');
    expect(markdown).toContain('Feed: https://buxx.me/agent/mood');
  });

  test('keeps api-v2 mode in agent markdown links', () => {
    const feed: MoodFeedResponse = {
      channel: {},
      posts: [
        {
          id: '44',
          datetime: '2026-04-30T10:00:00.000Z',
          tag: '',
          previewText: 'Structured post',
          previewHtml: '',
          media: [],
          gallery: null,
          image: null,
          imageFallback: null,
          imageWidth: null,
          imageHeight: null,
          imageLayout: null,
          imageKind: null,
          mediaHtml: '',
          needsDetailPage: false,
          forwardedFrom: null,
          quote: null,
          reactions: [],
          commentsCount: 0,
        },
      ],
    };

    const markdown = buildMoodAgentMarkdown(feed, new URL('https://buxx.me'), { useApiV2: true });
    const postMarkdown = buildMoodAgentPostPageMarkdown(feed.posts[0], new URL('https://buxx.me'), { useApiV2: true });

    expect(markdown).toContain('Source: https://buxx.me/mood?api-v2=true');
    expect(markdown).toContain('JSON: https://buxx.me/api/moods?api-v2=true');
    expect(markdown).toContain('Next: https://buxx.me/agent/mood?before=44&api-v2=true');
    expect(postMarkdown).toContain('Feed: https://buxx.me/agent/mood?api-v2=true');
  });
});
