import { describe, expect, test } from 'bun:test';
import { buildMoodAgentMarkdown } from '../../src/features/mood/server/serializers';
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
    expect(markdown).toContain('> Line one\n> Line two');
    expect(markdown).toContain('Quote: https://buxx.me/mood/41');
    expect(markdown).toContain('Quote text:\n> Quoted text');
    expect(markdown).toContain('- image: https://buxx.me/media/42.jpg (1200x800)');
    expect(markdown).not.toContain('<img');
  });
});
