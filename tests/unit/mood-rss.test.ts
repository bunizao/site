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

  test('serializes clean feed and item links', () => {
    const xml = buildMoodRssXml(
      { title: 'Mood' },
      [createPost()],
      new URL('https://buxx.me')
    );

    expect(xml).toContain('<link>https://buxx.me/mood</link>');
    expect(xml).toContain('<atom:link href="https://buxx.me/mood/rss.xml"');
    expect(xml).toContain('<guid isPermaLink="true">https://buxx.me/mood/990001</guid>');
    expect(xml).not.toContain('api-v2');
  });

  test('emits gallery images as absolute <img> tags in content', () => {
    const xml = buildMoodRssXml(
      { title: 'Mood' },
      [
        createPost({
          previewHtml: '<p>Gallery mood</p>',
          gallery: {
            count: 3,
            items: [
              { src: '/mood/990001/a.jpg', fallbackSrc: null, width: 800, height: 600, layout: null, alt: 'A' },
              { src: '/mood/990001/b.jpg', fallbackSrc: null, width: 800, height: 600, layout: null, alt: 'B' },
              { src: '/mood/990001/c.jpg', fallbackSrc: null, width: null, height: null, layout: null, alt: '' },
            ],
          },
        }),
      ],
      new URL('https://buxx.me')
    );

    const imgCount = (xml.match(/<img /g) ?? []).length;
    expect(imgCount).toBe(3);
    expect(xml).toContain('src="https://buxx.me/mood/990001/a.jpg"');
    expect(xml).toContain('src="https://buxx.me/mood/990001/b.jpg"');
    expect(xml).toContain('src="https://buxx.me/mood/990001/c.jpg"');
    expect(xml).toContain('width="800"');
  });

  test('emits a single post.image as an absolute <img> tag', () => {
    const xml = buildMoodRssXml(
      { title: 'Mood' },
      [
        createPost({
          previewHtml: '<p>Photo mood</p>',
          image: '/mood/990001/photo.jpg',
          imageWidth: 1200,
          imageHeight: 900,
        }),
      ],
      new URL('https://buxx.me')
    );

    const imgCount = (xml.match(/<img /g) ?? []).length;
    expect(imgCount).toBe(1);
    expect(xml).toContain('src="https://buxx.me/mood/990001/photo.jpg"');
    expect(xml).toContain('width="1200"');
    expect(xml).toContain('height="900"');
  });

  test('emits no <img> for text-only posts', () => {
    const xml = buildMoodRssXml(
      { title: 'Mood' },
      [createPost({ previewHtml: '<p>Just text</p>' })],
      new URL('https://buxx.me')
    );

    expect(xml).not.toContain('<img ');
  });

  test('does not duplicate an image the preview already embeds', () => {
    const xml = buildMoodRssXml(
      { title: 'Mood' },
      [
        createPost({
          previewHtml: '<p>Photo mood</p><img src="https://buxx.me/mood/990001/photo.jpg" alt="" />',
          image: '/mood/990001/photo.jpg',
          imageWidth: 1200,
          imageHeight: 900,
        }),
      ],
      new URL('https://buxx.me')
    );

    const imgCount = (xml.match(/<img /g) ?? []).length;
    expect(imgCount).toBe(1);
  });

  test('dedups a query-param image against escaped preview HTML', () => {
    const xml = buildMoodRssXml(
      { title: 'Mood' },
      [
        createPost({
          previewHtml: '<p>Photo mood</p><img src="https://buxx.me/api/v2/images/mood/990001/0?a=1&b=2" alt="" />',
          image: 'https://buxx.me/api/v2/images/mood/990001/0?a=1&b=2',
          imageWidth: 1200,
          imageHeight: 900,
        }),
      ],
      new URL('https://buxx.me')
    );

    // Preview HTML serializes `&` as `&amp;`; a raw substring check would miss
    // the match and duplicate the image. Escape-aware dedup keeps it single.
    const imgCount = (xml.match(/<img /g) ?? []).length;
    expect(imgCount).toBe(1);
  });

  test('does not let an id-prefix suppress a distinct image', () => {
    const xml = buildMoodRssXml(
      { title: 'Mood' },
      [
        createPost({
          previewHtml: '<p>Photo mood</p><img src="https://buxx.me/mood/1/00" alt="" />',
          image: '/mood/1/0',
          imageWidth: 1200,
          imageHeight: 900,
        }),
      ],
      new URL('https://buxx.me')
    );

    // `/mood/1/0` is a substring of the embedded `/mood/1/00`, but they are
    // distinct images: the appended one must survive.
    const imgCount = (xml.match(/<img /g) ?? []).length;
    expect(imgCount).toBe(2);
    expect(xml).toContain('src="https://buxx.me/mood/1/0"');
    expect(xml).toContain('src="https://buxx.me/mood/1/00"');
  });
});
