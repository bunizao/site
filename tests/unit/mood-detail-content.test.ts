import { describe, expect, test } from 'bun:test';
import type { MoodContentDocument } from '@bunizao/contracts';
import { renderStructuredMoodDetailContent } from '../../src/features/mood/shared/detail-content';

function createDocument(overrides: Partial<MoodContentDocument> = {}): MoodContentDocument {
  return {
    id: '42',
    source: 'mood',
    datetime: '2026-06-14T00:00:00.000Z',
    bodyHtml: '<p>Hello <strong>mood</strong></p><script>alert(1)</script>',
    previewText: 'Hello mood',
    previewHtml: 'Hello mood',
    hero: null,
    media: [],
    forwardedFrom: null,
    quote: null,
    reactions: [],
    commentsCount: 0,
    ...overrides,
  };
}

describe('structured mood detail content rendering', () => {
  test('renders body, image media, and mood-specific structured media', () => {
    const html = renderStructuredMoodDetailContent(createDocument({
      media: [
        {
          id: 'hero',
          type: 'image',
          src: 'https://image.example.test/mood/42/0.jpg',
          width: 1200,
          height: 800,
          layout: 'landscape',
          alt: 'Hero',
        },
        {
          type: 'link-preview',
          href: 'https://example.test/story',
          title: 'Example Story',
          description: 'A useful link',
          siteName: 'Example',
          thumbnailSrc: 'https://image.example.test/mood/42/link.jpg',
        },
        {
          type: 'document',
          src: 'https://image.example.test/mood/42/spec.pdf',
          fileName: 'Spec.pdf',
          fileSizeLabel: '4 KB',
          mimeType: 'application/pdf',
        },
        {
          type: 'poll',
          title: 'Choose one',
          description: 'Yes · No',
        },
      ],
    }));

    expect(html).toContain('class="mood-post-rich-body"');
    expect(html).toContain('class="mood-post-rich-media"');
    expect(html).toContain('class="rich-content-media rich-content-media--image rich-content-media--landscape"');
    expect(html).toContain('class="mood-item-media"');
    expect(html).toContain('bookmark-card bookmark-card--side-media');
    expect(html).toContain('Example Story');
    expect(html).toContain('tgme_widget_message_document_wrap');
    expect(html).toContain('Spec.pdf');
    expect(html).toContain('mood-unsupported-media-card');
    expect(html).toContain('Yes · No');
    expect(html).not.toContain('<script');
  });

  test('keeps unsafe structured media out of detail markup', () => {
    const html = renderStructuredMoodDetailContent(createDocument({
      bodyHtml: '<p>Safe</p><img src="javascript:alert(1)">',
      media: [
        {
          type: 'image',
          src: 'javascript:alert(1)',
          alt: 'Unsafe image',
        },
        {
          type: 'link-preview',
          href: 'javascript:alert(1)',
          title: 'Unsafe link',
        },
      ],
    }));

    expect(html).toBe('<div class="mood-post-rich-body"><p>Safe</p></div>');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('Unsafe');
  });
});
