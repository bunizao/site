import { describe, expect, test } from 'bun:test';
import * as cheerio from 'cheerio';
import type { MoodContentDocument } from '@bunizao/contracts';
import {
  prioritizeMoodDetailMedia,
  renderStructuredMoodDetailContent,
} from '../../src/features/mood/shared/detail-content';

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
  test('keeps the detail article visible during first paint', async () => {
    const source = await Bun.file('src/features/mood/ui/DetailArticle.astro').text();
    const route = await Bun.file('src/pages/mood/[id].astro').text();
    const layout = await Bun.file('src/layouts/Layout.astro').text();

    expect(source).not.toContain('animation: fade-in');
    expect(source).not.toContain('@keyframes fade-in');
    expect(source).toMatch(/@view-transition\s*\{\s*navigation:\s*none;/);
    expect(route).toContain('preloadFont="sans"');
    expect(layout).toContain("preloadFont?: 'mono' | 'sans'");
    expect(layout).toContain("? '/fonts/inter-variable.woff2'");
    expect(route).toMatch(/requestAnimationFrame\(\(\) => \{\s*requestAnimationFrame\(\(\) => \{/);
  });

  test('prioritizes only the first meaningful detail image', () => {
    const html = prioritizeMoodDetailMedia([
      '<span class="tg-emoji"><img src="/emoji.webp" alt="" /></span>',
      '<a class="video-too-big"><img class="video-too-big__thumb" src="/video.jpg" alt="" loading="lazy" /></a>',
      '<span class="bookmark-card__media"><img src="/card.jpg" alt="" loading="lazy" /></span>',
    ].join(''));

    const $ = cheerio.load(html, null, false);
    const emoji = $('.tg-emoji img');
    const video = $('.video-too-big__thumb');
    const card = $('.bookmark-card__media img');

    expect(emoji.attr('fetchpriority')).toBeUndefined();
    expect(video.attr('loading')).toBe('eager');
    expect(video.attr('fetchpriority')).toBe('high');
    expect(video.attr('decoding')).toBe('sync');
    expect(card.attr('loading')).toBe('lazy');
    expect(card.attr('fetchpriority')).toBeUndefined();
  });

  test('makes a deferred gallery image discoverable in the initial HTML', () => {
    const html = prioritizeMoodDetailMedia(
      '<img class="mood-gallery-image" data-deferred-src="/gallery.jpg" loading="lazy" />'
    );

    expect(html).toContain('src="/gallery.jpg"');
    expect(html).toContain('loading="eager"');
    expect(html).toContain('fetchpriority="high"');
  });

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
          linkPreviewLayout: 'compact',
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

  test('renders oversized video documents as Telegram video placeholders', () => {
    const html = renderStructuredMoodDetailContent(createDocument({
      media: [
        {
          id: 'telegram-3567-video-0',
          type: 'document',
          href: 'https://t.me/tutumood/3567',
          originalUrl: 'https://t.me/tutumood/3567',
          title: 'Media is too big',
          fileName: 'Media is too big',
          mimeType: 'video',
          width: 2286,
          height: 1440,
          thumbnailSrc: '/static/https:/cdn.example.test/video-thumb.jpg',
        },
      ],
    }));

    expect(html).toContain('class="video-too-big"');
    expect(html).toContain('href="https://t.me/tutumood/3567"');
    expect(html).toContain('class="video-too-big__thumb"');
    expect(html).toContain('Media is too big');
    expect(html).not.toContain('tgme_widget_message_document_wrap');
  });
});
