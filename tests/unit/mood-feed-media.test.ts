import { describe, expect, test } from 'bun:test';
import {
  hasStructuredMoodFeedMedia,
  renderStructuredMoodFeedMediaMarkup,
} from '../../src/features/mood/shared/feed-media';

describe('structured mood feed media rendering', () => {
  test('renders video, audio, document, and link preview media', () => {
    const html = renderStructuredMoodFeedMediaMarkup([
      {
        type: 'video',
        src: 'https://image.example.test/mood/1/video.mp4',
        posterSrc: 'https://image.example.test/mood/1/poster.jpg',
        width: 720,
        height: 1280,
      },
      {
        type: 'audio',
        src: 'https://image.example.test/mood/1/voice.ogg',
      },
      {
        type: 'document',
        src: 'https://image.example.test/mood/1/file.pdf',
        fileName: 'notes.pdf',
        fileSizeLabel: '42 KB',
        mimeType: 'application/pdf',
      },
      {
        type: 'link-preview',
        href: 'https://example.test/article',
        title: 'Example article',
        description: 'A short preview',
        siteName: 'Example',
      },
    ]);

    expect(html).toContain('<video class="video--ultra-tall"');
    expect(html).toContain('poster="https://image.example.test/mood/1/poster.jpg"');
    expect(html).toContain('<audio src="https://image.example.test/mood/1/voice.ogg" controls');
    expect(html).toContain('tgme_widget_message_document_wrap');
    expect(html).toContain('notes.pdf');
    expect(html).toContain('42 KB · application/pdf');
    expect(html).toContain('bookmark-card');
    expect(html).toContain('Example article');
  });

  test('renders audio as the shared listening card on rich surfaces', () => {
    const html = renderStructuredMoodFeedMediaMarkup([
      {
        type: 'audio',
        src: 'https://image.example.test/mood/1/song.mp3',
        fileName: 'Some Artist - Some Song.mp3',
        durationSeconds: 245,
        fileSizeLabel: '9.2 MB',
        originalUrl: 'https://t.me/example/3672',
        thumbnailSrc: 'https://image.example.test/mood/1/cover.jpg',
      },
    ], { richAudio: true });

    expect(html).toContain('<div class="mood-listening">');
    expect(html).toContain('data-listening');
    expect(html).toContain('data-static="true"');
    expect(html).toContain('data-preview-url="https://image.example.test/mood/1/song.mp3"');
    expect(html).toContain('data-track-url="https://t.me/example/3672"');
    expect(html).toContain('data-title="Some Song"');
    expect(html).toContain('>Some Artist</span>');
    expect(html).toContain('>4:05</span>');
    expect(html).not.toContain('9.2 MB');
    expect(html).toContain('src="https://image.example.test/mood/1/cover.jpg"');
    expect(html).not.toContain('<audio');
  });

  test('keeps native audio and preserves album art when rich audio has no source', () => {
    const nativeHtml = renderStructuredMoodFeedMediaMarkup([
      {
        type: 'audio',
        src: 'https://image.example.test/mood/1/voice.ogg',
      },
    ]);
    expect(nativeHtml).toContain('<audio src="https://image.example.test/mood/1/voice.ogg" controls');

    const fallbackHtml = renderStructuredMoodFeedMediaMarkup([
      {
        type: 'audio',
        originalUrl: 'https://t.me/example/3672',
        fileName: 'Some Artist - Too Big.flac',
        fileSizeLabel: '32 MB',
        durationSeconds: 256,
        thumbnailSrc: 'https://image.example.test/mood/1/cover.jpg',
      },
    ], { richAudio: true });
    expect(fallbackHtml).toContain('<div class="mood-listening">');
    expect(fallbackHtml).toContain('class="listening is-recent has-no-playback is-cover"');
    expect(fallbackHtml).toContain('data-preview-url=""');
    expect(fallbackHtml).toContain('data-track-url="https://t.me/example/3672"');
    expect(fallbackHtml).toContain('aria-label="Open Too Big"');
    expect(fallbackHtml).toContain('data-title="Too Big"');
    expect(fallbackHtml).toContain('>Some Artist</span>');
    expect(fallbackHtml).toContain('>4:16</span>');
    expect(fallbackHtml).toContain('src="https://image.example.test/mood/1/cover.jpg"');
    expect(fallbackHtml).toContain('data-listening-progress-row');
    expect(fallbackHtml).not.toContain('tgme_widget_message_document_wrap');

    const noArtworkHtml = renderStructuredMoodFeedMediaMarkup([
      {
        type: 'audio',
        originalUrl: 'https://t.me/example/3671',
        fileName: 'voice-message.ogg',
      },
    ], { richAudio: true });
    expect(noArtworkHtml).toContain('tgme_widget_message_document_wrap');
    expect(noArtworkHtml).not.toContain('data-listening');
  });

  test('can defer feed video sources until the viewport observer hydrates them', () => {
    const html = renderStructuredMoodFeedMediaMarkup([
      {
        type: 'video',
        src: 'https://image.example.test/mood/1/video.mp4',
        posterSrc: 'https://image.example.test/mood/1/poster.jpg',
        width: 720,
        height: 1280,
      },
    ], { lazyVideo: true });

    expect(html).toContain('data-mood-video-src="https://image.example.test/mood/1/video.mp4"');
    expect(html).toContain('preload="none"');
    expect(html).toContain('data-mood-video-lazy="true"');
    expect(html).toContain('data-mood-autoplay="true"');
    expect(html).toContain('controls muted loop playsinline');
    expect(html).not.toContain(' src="https://image.example.test/mood/1/video.mp4"');
  });

  test('uses the existing large and compact bookmark card layouts', () => {
    const html = renderStructuredMoodFeedMediaMarkup([
      {
        type: 'link-preview',
        href: 'https://example.test/article',
        title: 'Large preview',
        thumbnailSrc: 'https://image.example.test/large.jpg',
        linkPreviewLayout: 'large',
      },
      {
        type: 'link-preview',
        href: 'https://example.test/profile',
        title: 'Compact preview',
        thumbnailSrc: 'https://image.example.test/avatar.jpg',
        linkPreviewLayout: 'compact',
      },
    ]);

    expect(html).toContain('class="bookmark-card" href="https://example.test/article"');
    expect(html).toContain('class="bookmark-card bookmark-card--side-media" href="https://example.test/profile"');
  });

  test('derives the compact layout from thumbnail dimensions when linkPreviewLayout is absent', () => {
    // Archive rows unfurled before linkPreviewLayout existed carry only
    // width/height. The threshold mirrors getLinkPreviewLayout in
    // site-api/src/features/mood/server/mood-repository.ts (ratio < 1.5).
    const html = renderStructuredMoodFeedMediaMarkup([
      {
        type: 'link-preview',
        href: 'https://example.test/square',
        title: 'Square thumbnail',
        thumbnailSrc: 'https://image.example.test/square.jpg',
        width: 400,
        height: 400,
      },
      {
        type: 'link-preview',
        href: 'https://example.test/banner',
        title: 'Wide OG banner',
        thumbnailSrc: 'https://image.example.test/banner.jpg',
        width: 1200,
        height: 630,
      },
      {
        type: 'link-preview',
        href: 'https://example.test/threshold',
        title: 'Exactly at threshold',
        thumbnailSrc: 'https://image.example.test/threshold.jpg',
        width: 600,
        height: 400,
      },
      {
        type: 'link-preview',
        href: 'https://example.test/no-dims',
        title: 'No dimensions',
        thumbnailSrc: 'https://image.example.test/no-dims.jpg',
      },
      {
        type: 'link-preview',
        href: 'https://example.test/explicit',
        title: 'Explicit layout wins over dimensions',
        thumbnailSrc: 'https://image.example.test/explicit.jpg',
        width: 400,
        height: 400,
        linkPreviewLayout: 'large',
      },
    ]);

    expect(html).toContain('class="bookmark-card bookmark-card--side-media" href="https://example.test/square"');
    expect(html).toContain('class="bookmark-card" href="https://example.test/banner"');
    expect(html).toContain('class="bookmark-card" href="https://example.test/threshold"');
    expect(html).toContain('class="bookmark-card" href="https://example.test/no-dims"');
    expect(html).toContain('class="bookmark-card" href="https://example.test/explicit"');
  });

  test('skips image convenience media and unsafe URLs', () => {
    const html = renderStructuredMoodFeedMediaMarkup([
      {
        type: 'image',
        src: 'https://image.example.test/mood/1/photo.jpg',
      },
      {
        type: 'video',
        src: 'javascript:alert(1)',
      },
      {
        type: 'link-preview',
        href: 'javascript:alert(1)',
        title: '<bad>',
      },
    ]);

    expect(html).toBe('');
    expect(hasStructuredMoodFeedMedia([{ type: 'image', src: '/photo.jpg' }])).toBe(false);
  });

  test('renders location and poll fallbacks without requiring a media URL', () => {
    const html = renderStructuredMoodFeedMediaMarkup([
      {
        type: 'location',
        title: 'Kuala Lumpur',
        description: 'Malaysia',
      },
      {
        type: 'poll',
        title: 'Choose one',
      },
    ]);

    expect(html).toContain('tgme_widget_message_location_wrap');
    expect(html).toContain('Kuala Lumpur');
    expect(html).toContain('Malaysia');
    expect(html).toContain('mood-unsupported-media-card');
    expect(html).toContain('Choose one');
  });
});
