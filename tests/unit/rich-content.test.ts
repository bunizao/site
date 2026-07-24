import { describe, expect, test } from 'bun:test';
import type { ContentDocument } from '@bunizao/contracts';

import {
  renderRichContentDocument,
  renderRichContentMedia,
  sanitizeRichContentHtml,
} from '../../src/features/content/rich-content';

describe('rich content rendering', () => {
  test('sanitizes contract body HTML before rendering', () => {
    const html = sanitizeRichContentHtml([
      '<p onclick="bad()">Hello <a href="javascript:alert(1)" onclick="bad()">bad</a>',
      '<a href="https://example.com/article" style="color:red">safe</a>',
      '<span class="tg-emoji unsafe" data-emoji-id="5368324170671202286" data-emoji-animated="true" onclick="bad()">🙂</span>',
      '<span class="tg-spoiler unsafe">secret</span>',
      '<blockquote class="tg-blockquote-expandable unsafe">more</blockquote>',
      '<pre><code class="language-typescript unsafe">const ok = true</code></pre>',
      '<time datetime="2026-06-13T00:00:00.000Z" onclick="bad()">June 13</time>',
      '<script>alert(1)</script><img src="https://example.com/inline.jpg" alt="">',
      '</p>',
    ].join(''));

    expect(html).toContain('Hello bad');
    expect(html).toContain('<a href="https://example.com/article" target="_blank" rel="noopener noreferrer">safe</a>');
    expect(html).toContain('class="tg-emoji"');
    expect(html).toContain('class="tg-emoji-fallback"');
    expect(html).toContain('src="/static/https:/t.me/i/emoji/5368324170671202286.webp"');
    expect(html).toContain('alt="🙂"');
    expect(html).toContain('class="tg-spoiler"');
    expect(html).toContain('class="tg-blockquote-expandable"');
    expect(html).toContain('class="language-typescript"');
    expect(html).toContain('data-emoji-id="5368324170671202286"');
    expect(html).not.toContain('data-emoji-animated');
    expect(html).toContain('datetime="2026-06-13T00:00:00.000Z"');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('style=');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('inline.jpg');
    expect(html).not.toContain('unsafe');
  });

  test('renders structured media from ContentDocument and skips unsafe media URLs', () => {
    const document = {
      id: '123',
      source: 'mood',
      datetime: '2026-06-13T00:00:00.000Z',
      bodyHtml: '<p>Look</p><video src="javascript:alert(1)"></video>',
      media: [
        {
          id: 'hero',
          type: 'image',
          src: '/media/hero.jpg',
          fallbackSrc: 'javascript:alert(1)',
          width: 1200,
          height: 800,
          layout: 'landscape',
          alt: 'Hero <shot>',
        },
        {
          type: 'video',
          src: 'https://cdn.example.test/video.mp4',
          posterSrc: '/media/poster.jpg',
          width: 640,
          height: 360,
          layout: 'landscape',
          alt: 'Clip',
        },
        {
          type: 'image',
          src: 'javascript:alert(1)',
          alt: 'Unsafe',
        },
      ],
      reactions: [],
      commentsCount: 0,
    } satisfies ContentDocument;

    const result = renderRichContentDocument(document);

    expect(result.bodyHtml).toBe('<p>Look</p>');
    expect(result.mediaCount).toBe(2);
    expect(result.html).toContain('class="rich-content-body"');
    expect(result.html).toContain('class="rich-content-media-list"');
    expect(result.mediaHtml).toContain('class="rich-content-media rich-content-media--image rich-content-media--landscape"');
    expect(result.mediaHtml).toContain('data-media-id="hero"');
    expect(result.mediaHtml).toContain('src="/media/hero.jpg"');
    expect(result.mediaHtml).toContain('alt="Hero &lt;shot&gt;"');
    expect(result.mediaHtml).toContain('src="https://cdn.example.test/video.mp4"');
    expect(result.mediaHtml).toContain('poster="/media/poster.jpg"');
    expect(result.mediaHtml).toContain('controls playsinline preload="metadata"');
    expect(result.html).not.toContain('javascript:');
    expect(result.html).not.toContain('Unsafe');
  });

  test('renders document media as safe links', () => {
    const html = renderRichContentMedia([
      {
        type: 'document',
        src: '/files/spec.pdf',
        originalUrl: 'javascript:alert(1)',
        alt: 'Spec <PDF>',
      },
    ]);

    expect(html).toContain('<a href="/files/spec.pdf" rel="noopener noreferrer" target="_blank">Spec &lt;PDF&gt;</a>');
    expect(html).not.toContain('javascript:');
  });
});
