import { expect } from 'bun:test';
import type { MediaItem, MoodFeedItem } from '@bunizao/contracts';

type ComponentKind =
  | 'gallery'
  | 'sticker'
  | 'voice'
  | 'roundvideo'
  | 'forwarded'
  | 'reactions'
  | 'comments'
  | 'code-block'
  | 'location'
  | 'poll'
  | 'link-preview'
  | 'document';

export interface MoodComponentRegistryEntry {
  kind: ComponentKind;
  prodId: string;
  fixtureFactory(): MoodFeedItem;
  assert(post: MoodFeedItem, renderedMediaHtml: string): void;
}

function mediaItem(overrides: Partial<MediaItem>): MediaItem {
  return {
    type: 'image',
    ...overrides,
  };
}

function createPost(overrides: Partial<MoodFeedItem>): MoodFeedItem {
  return {
    id: 'fixture',
    datetime: '2026-06-14T00:00:00.000Z',
    tag: 'test',
    previewText: '',
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
    ...overrides,
  };
}

export const moodComponentRegistry: MoodComponentRegistryEntry[] = [
  {
    kind: 'gallery',
    prodId: '4102',
    fixtureFactory: () => createPost({
      id: 'gallery-fixture',
      media: [
        mediaItem({ id: 'photo-1', src: 'https://image.example.test/mood/4102/0.jpg', width: 800, height: 600, alt: 'First photo' }),
        mediaItem({ id: 'photo-2', src: 'https://image.example.test/mood/4102/1.jpg', width: 640, height: 640, alt: 'Second photo' }),
      ],
      gallery: {
        count: 2,
        items: [
          { src: 'https://image.example.test/mood/4102/0.jpg', fallbackSrc: null, width: 800, height: 600, layout: 'landscape', alt: 'First photo' },
          { src: 'https://image.example.test/mood/4102/1.jpg', fallbackSrc: null, width: 640, height: 640, layout: null, alt: 'Second photo' },
        ],
      },
      image: 'https://image.example.test/mood/4102/0.jpg',
    }),
    assert(post, renderedMediaHtml) {
      expect(post.media.map((item) => item.type)).toEqual(['image', 'image']);
      expect(post.gallery?.count).toBe(2);
      expect(post.image).toBe('https://image.example.test/mood/4102/0.jpg');
      expect(renderedMediaHtml).toBe('');
    },
  },
  {
    kind: 'sticker',
    prodId: '4107',
    fixtureFactory: () => createPost({
      id: 'sticker-fixture',
      media: [mediaItem({ type: 'sticker', src: 'https://image.example.test/mood/4107/sticker.webp', alt: 'Sticker' })],
      image: 'https://image.example.test/mood/4107/sticker.webp',
      imageKind: 'sticker',
    }),
    assert(post, renderedMediaHtml) {
      expect(post.media[0]?.type).toBe('sticker');
      expect(post.imageKind).toBe('sticker');
      expect(renderedMediaHtml).toBe('');
    },
  },
  {
    kind: 'voice',
    prodId: '4108',
    fixtureFactory: () => createPost({
      id: 'voice-fixture',
      media: [mediaItem({ type: 'audio', src: 'https://image.example.test/mood/4108/voice.ogg', durationSeconds: 12 })],
      needsDetailPage: true,
    }),
    assert(post, renderedMediaHtml) {
      expect(post.media[0]?.type).toBe('audio');
      expect(renderedMediaHtml).toContain('<audio');
      expect(renderedMediaHtml).toContain('voice.ogg');
    },
  },
  {
    kind: 'roundvideo',
    prodId: '3559',
    fixtureFactory: () => createPost({
      id: 'roundvideo-fixture',
      previewMediaType: 'roundvideo',
      media: [mediaItem({
        type: 'video',
        src: 'https://image.example.test/mood/3559/video.mp4',
        posterSrc: 'https://image.example.test/mood/3559/poster.jpg',
        width: 360,
        height: 360,
      })],
      needsDetailPage: true,
    }),
    assert(post, renderedMediaHtml) {
      expect(post.media[0]?.type).toBe('video');
      expect(renderedMediaHtml).toContain('<video');
      expect(renderedMediaHtml).toContain('poster.jpg');
    },
  },
  {
    kind: 'forwarded',
    prodId: '3558',
    fixtureFactory: () => createPost({
      id: 'forwarded-fixture',
      forwardedFrom: {
        name: 'Original Channel',
        href: 'https://t.me/original/1',
        author: 'Original Author',
      },
    }),
    assert(post) {
      expect(post.forwardedFrom?.name).toBe('Original Channel');
      expect(post.forwardedFrom?.href).toContain('t.me/original');
    },
  },
  {
    kind: 'reactions',
    prodId: '3558',
    fixtureFactory: () => createPost({
      id: 'reactions-fixture',
      reactions: [{ emoji: '🔥', count: '3', isPaid: false }],
    }),
    assert(post) {
      expect(post.reactions).toEqual([{ emoji: '🔥', count: '3', isPaid: false }]);
    },
  },
  {
    kind: 'comments',
    prodId: '3558',
    fixtureFactory: () => createPost({
      id: 'comments-fixture',
      commentsCount: 7,
    }),
    assert(post) {
      expect(post.commentsCount).toBe(7);
    },
  },
  {
    kind: 'code-block',
    prodId: '1991',
    fixtureFactory: () => createPost({
      id: 'code-block-fixture',
      previewText: 'const value = 1;',
      previewHtml: '<pre><code class="language-ts">const value = 1;</code></pre>',
      needsDetailPage: true,
    }),
    assert(post) {
      expect(post.previewHtml).toContain('<pre><code');
      expect(post.previewHtml).toContain('language-ts');
    },
  },
  {
    kind: 'location',
    prodId: '4106',
    fixtureFactory: () => createPost({
      id: 'location-fixture',
      media: [mediaItem({
        type: 'location',
        href: 'https://foursquare.com/v/example',
        thumbnailSrc: 'https://image.example.test/mood/4106/map.jpg',
        title: 'Mannings Venetian',
        description: 'Macau',
      })],
    }),
    assert(post, renderedMediaHtml) {
      expect(post.media[0]?.type).toBe('location');
      expect(renderedMediaHtml).toContain('tgme_widget_message_location_wrap');
      expect(renderedMediaHtml).toContain('Mannings Venetian');
    },
  },
  {
    kind: 'poll',
    prodId: '4109',
    fixtureFactory: () => createPost({
      id: 'poll-fixture',
      media: [mediaItem({ type: 'poll', title: 'Choose one', description: 'Yes or no' })],
      needsDetailPage: true,
    }),
    assert(post, renderedMediaHtml) {
      expect(post.media[0]?.type).toBe('poll');
      expect(renderedMediaHtml).toContain('mood-unsupported-media-card');
      expect(renderedMediaHtml).toContain('Yes or no');
    },
  },
  {
    kind: 'link-preview',
    prodId: '3572',
    fixtureFactory: () => createPost({
      id: 'link-preview-fixture',
      media: [mediaItem({
        type: 'link-preview',
        href: 'https://example.test/article',
        title: 'Example article',
        description: 'A short preview',
        siteName: 'Example',
      })],
    }),
    assert(post, renderedMediaHtml) {
      expect(post.media[0]?.type).toBe('link-preview');
      expect(renderedMediaHtml).toContain('bookmark-card');
      expect(renderedMediaHtml).toContain('Example article');
    },
  },
  {
    kind: 'document',
    prodId: '1991',
    fixtureFactory: () => createPost({
      id: 'document-fixture',
      media: [mediaItem({
        type: 'document',
        src: 'https://image.example.test/mood/1991/file.pdf',
        fileName: 'My Vibe.pdf',
        fileSizeLabel: '113.9 KB',
        mimeType: 'application/pdf',
      })],
      needsDetailPage: true,
    }),
    assert(post, renderedMediaHtml) {
      expect(post.media[0]?.type).toBe('document');
      expect(renderedMediaHtml).toContain('tgme_widget_message_document_wrap');
      expect(renderedMediaHtml).toContain('My Vibe.pdf');
    },
  },
];
