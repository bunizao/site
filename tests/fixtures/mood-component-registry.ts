import { expect } from 'bun:test';
import type { MediaItem, MoodFeedItem } from '@bunizao/contracts';

export type MoodComponentKind =
  | 'gallery'
  | 'sticker'
  | 'voice'
  | 'video'
  | 'roundvideo'
  | 'oversized-video'
  | 'forwarded'
  | 'quote'
  | 'reactions'
  | 'comments'
  | 'code-block'
  | 'location'
  | 'poll'
  | 'link-preview'
  | 'document';

export interface MoodComponentRegistryEntry {
  kind: MoodComponentKind;
  prodId: string | null;
  prodWindowBefore?: string;
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
    prodId: null,
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
    prodId: null,
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
    prodId: null,
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
    kind: 'video',
    prodId: '3559',
    prodWindowBefore: '3600',
    fixtureFactory: () => createPost({
      id: 'video-fixture',
      media: [mediaItem({
        type: 'video',
        src: 'https://image.example.test/mood/3559/video.mp4',
        posterSrc: 'https://image.example.test/mood/3559/poster.jpg',
        width: 720,
        height: 720,
      })],
    }),
    assert(post, renderedMediaHtml) {
      expect(post.media[0]?.type).toBe('video');
      expect(renderedMediaHtml).toContain('<video');
      expect(renderedMediaHtml).toContain('poster.jpg');
    },
  },
  {
    kind: 'roundvideo',
    prodId: null,
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
    kind: 'oversized-video',
    prodId: '3567',
    prodWindowBefore: '3600',
    fixtureFactory: () => createPost({
      id: 'oversized-video-fixture',
      previewMediaType: 'too-big-video',
      media: [mediaItem({
        type: 'video',
        src: 'https://image.example.test/mood/3567/video.mp4',
        posterSrc: 'https://image.example.test/mood/3567/poster.jpg',
        width: 720,
        height: 1280,
        layout: 'ultra-tall',
      })],
      image: 'https://image.example.test/mood/3567/poster.jpg',
      imageLayout: 'ultra-tall',
      needsDetailPage: true,
    }),
    assert(post, renderedMediaHtml) {
      expect(post.previewMediaType).toBe('too-big-video');
      expect(post.media[0]?.type).toBe('video');
      expect(post.needsDetailPage).toBe(true);
      expect(renderedMediaHtml).toContain('<video');
      expect(renderedMediaHtml).toContain('poster.jpg');
    },
  },
  {
    kind: 'forwarded',
    prodId: '3572',
    prodWindowBefore: '3600',
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
    kind: 'quote',
    prodId: '3558',
    prodWindowBefore: '3600',
    fixtureFactory: () => createPost({
      id: 'quote-fixture',
      quote: {
        text: 'Quoted post text',
        href: '/mood/3557',
        author: 'Levitating',
      },
    }),
    assert(post) {
      expect(post.quote?.text).toBe('Quoted post text');
      expect(post.quote?.href).toBe('/mood/3557');
    },
  },
  {
    kind: 'reactions',
    prodId: '3559',
    prodWindowBefore: '3600',
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
    prodId: '1979',
    prodWindowBefore: '2000',
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
    prodId: null,
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
    prodId: null,
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
    prodId: null,
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
    prodWindowBefore: '3600',
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
    prodWindowBefore: '2000',
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
