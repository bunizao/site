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
