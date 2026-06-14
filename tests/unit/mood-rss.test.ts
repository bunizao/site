import { describe, expect, test } from 'bun:test';
import { buildMoodRssXml } from '../../src/features/mood/server/serializers';
import type { MoodFeedItem } from '../../src/features/mood/server/contracts';

function createPost(overrides: Partial<MoodFeedItem> = {}): MoodFeedItem {
  return {
    id: '990001',
    datetime: '2026-06-14T12:00:00.000Z',
    tag: 'test',
    previewText: 'Structured RSS post',
    previewHtml: '<p>Structured RSS post</p>',
    previewMediaType: 'video',
    media: [],
    gallery: null,
    image: null,
    imageFallback: null,
    imageWidth: null,
    imageHeight: null,
    imageLayout: null,
    imageKind: null,
    mediaHtml: '',
    needsDetailPage: true,
    forwardedFrom: null,
    quote: null,
    reactions: [],
    commentsCount: 0,
    ...overrides,
  };
}

describe('buildMoodRssXml', () => {
  test('uses structured media before mediaHtml fallback', () => {
    const xml = buildMoodRssXml(
      { title: 'Mood' },
      [
        createPost({
          media: [{
            type: 'video',
            src: '/mood/990001/video.mp4',
            posterSrc: '/mood/990001/poster.jpg',
            width: 1280,
            height: 720,
          }],
          mediaHtml: '<a href="/legacy">legacy media</a>',
        }),
      ],
      new URL('https://buxx.me')
    );

    expect(xml).toContain('src="https://buxx.me/mood/990001/video.mp4"');
    expect(xml).toContain('poster="https://buxx.me/mood/990001/poster.jpg"');
    expect(xml).not.toContain('legacy media');
  });

  test('keeps mediaHtml as an RSS fallback when structured media is not renderable', () => {
    const xml = buildMoodRssXml(
      { title: 'Mood' },
      [
        createPost({
          media: [{ type: 'image', src: '/mood/990001/image.jpg' }],
          mediaHtml: '<a href="/legacy">legacy media</a>',
        }),
      ],
      new URL('https://buxx.me')
    );

    expect(xml).toContain('href="https://buxx.me/legacy"');
    expect(xml).toContain('legacy media');
  });

  test('keeps explicit API mode in feed and item links', () => {
    const xml = buildMoodRssXml(
      { title: 'Mood' },
      [createPost()],
      new URL('https://buxx.me'),
      { apiModeQueryValue: 'false' }
    );

    expect(xml).toContain('<link>https://buxx.me/mood?api-v2=false</link>');
    expect(xml).toContain('<atom:link href="https://buxx.me/mood/rss.xml?api-v2=false"');
    expect(xml).toContain('<guid isPermaLink="true">https://buxx.me/mood/990001?api-v2=false</guid>');
  });
});
