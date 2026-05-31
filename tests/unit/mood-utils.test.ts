import { describe, expect, test } from 'bun:test';
import {
  getFirstImage,
  getFirstImageMeta,
  getInlineMediaPreview,
  getQuotePreview,
  getRelatedLinks,
  getTextPreview,
  getTextPreviewHtml,
} from '../../src/features/mood/shared/utils';

describe('getFirstImage', () => {
  test('extracts video poster when no img exists', () => {
    const content = `
      <video
        src="/static/https://cdn5.telesco.pe/file/example.mp4"
        poster="/static/https://cdn5.telesco.pe/file/example-poster.jpg"
        controls="true"
      ></video>
    `;

    expect(getFirstImage(content)).toBe('/static/https://cdn5.telesco.pe/file/example-poster.jpg');
  });

  test('marks sticker images as sticker media', () => {
    const content = '<img class="sticker" src="/static/sticker.webp" alt="Sticker" loading="lazy" />';

    expect(getFirstImageMeta(content)).toMatchObject({
      src: '/static/sticker.webp',
      kind: 'sticker',
    });
  });
});

describe('video-only feed preview heuristic', () => {
  test('can prefer a static image for empty-text video posts', () => {
    const content = `
      <video
        src="/static/https://cdn5.telesco.pe/file/example.mp4"
        poster="/static/https://cdn5.telesco.pe/file/example-poster.jpg"
        controls="true"
      ></video>
    `;

    const mediaPreview = getInlineMediaPreview(content);
    const previewText = getTextPreview({ text: '', content });
    const firstImage = getFirstImage(content);
    const preferStaticImagePreview = mediaPreview?.type === 'video' && !previewText.trim() && Boolean(firstImage);

    expect(mediaPreview?.type).toBe('video');
    expect(previewText).toBe('');
    expect(firstImage).toBe('/static/https://cdn5.telesco.pe/file/example-poster.jpg');
    expect(preferStaticImagePreview).toBe(true);
  });

  test('keeps audio documents ahead of generic document previews', () => {
    const content = `
      <a class="tgme_widget_message_document_wrap" href="https://t.me/tutumood/4106">
        <div class="tgme_widget_message_document_icon audio accent_bg"></div>
        <div class="tgme_widget_message_document">
          <div class="tgme_widget_message_document_title accent_color">voice.mp3</div>
        </div>
      </a>
    `;

    const mediaPreview = getInlineMediaPreview(content);

    expect(mediaPreview?.type).toBe('audio');
    expect(mediaPreview?.html).toContain('voice.mp3');
  });

  test('extracts generic documents without affecting bookmark-only previews', () => {
    const documentPreview = getInlineMediaPreview(`
      <a class="tgme_widget_message_document_wrap" href="https://t.me/tutumood/4105">
        <div class="tgme_widget_message_document_icon accent_bg"></div>
        <div class="tgme_widget_message_document">
          <div class="tgme_widget_message_document_title accent_color">My Vibe.pdf</div>
        </div>
      </a>
    `);
    const bookmarkPreview = getInlineMediaPreview(`
      <a class="bookmark-card" href="https://example.org/article">
        <span class="bookmark-card__content">
          <span class="bookmark-card__title">Article</span>
        </span>
      </a>
    `);

    expect(documentPreview?.type).toBe('document');
    expect(documentPreview?.html).toContain('My Vibe.pdf');
    expect(bookmarkPreview?.type).toBe('bookmark');
    expect(bookmarkPreview?.html).toContain('Article');
  });
});

describe('getQuotePreview', () => {
  test('extracts detail quote cards as feed quotes', () => {
    const content = [
      '<a class="mood-detail-quote mood-item-quote mood-comment-quote" href="/mood/3420">',
      '<span class="mood-detail-quote-body mood-item-quote-body">',
      '<p class="mood-detail-quote-text mood-item-quote-text">哎想到今晚 meta 财报又睡不着了</p>',
      '</span>',
      '</a>',
      '卧槽记错时间了！',
    ].join('');

    expect(getQuotePreview(content)).toEqual({
      text: '哎想到今晚 meta 财报又睡不着了',
      href: '/mood/3420',
      thumbnailSrc: undefined,
    });
    expect(getTextPreview({ content })).toBe('卧槽记错时间了！');
    expect(getTextPreviewHtml({ content })).toBe('卧槽记错时间了！');
  });

  test('keeps quote card images available for embed thumbnails', () => {
    const content = [
      '<a class="mood-detail-quote mood-item-quote mood-comment-quote" href="/mood/1000">',
      '<span class="mood-item-quote-media">',
      '<img class="mood-item-quote-image" src="https://image.buxx.me/mood/1000/0" alt="" />',
      '</span>',
      '<span class="mood-item-quote-body">',
      '<p class="mood-item-quote-text">怎么变成A了</p>',
      '</span>',
      '</a>',
      '我是爱因斯坦',
    ].join('');

    expect(getFirstImage(content)).toBe('https://image.buxx.me/mood/1000/0');
    expect(getFirstImageMeta(content)).toMatchObject({
      src: 'https://image.buxx.me/mood/1000/0',
      fallbackSrc: null,
      layout: null,
    });
  });

  test('does not invent a thumbnail for text-only replies with a link target', () => {
    const content = `
      <a class="tgme_widget_message_reply" href="/mood/3314">
        <div class="tgme_widget_message_author">
          <span class="tgme_widget_message_author_name">Levitating</span>
        </div>
        <div class="tgme_widget_message_text tgme_widget_message_reply_text">
          https://x.com/nash_su/status/2040622739896340701 哈哈 开源已死。。
        </div>
      </a>
    `;

    const quote = getQuotePreview(content, {
      channel: 'tutumood',
      channelTitle: 'Levitating',
      hdImageBase: 'https://image.buxx.me',
    });

    expect(quote).not.toBeNull();
    expect(quote?.href).toBe('/mood/3314');
    expect(quote?.thumbnailSrc).toBeUndefined();
  });

  test('uses inline reply thumbnails before HD fallback guesses', () => {
    const content = `
      <a class="tgme_widget_message_reply" href="/mood/3408">
        <i
          class="tgme_widget_message_reply_thumb"
          style="background-image:url('https://cdn5.telesco.pe/file/reply-video-thumb.jpg')"
        ></i>
        <div class="tgme_widget_message_text tgme_widget_message_reply_text">
          科研成果
        </div>
      </a>
    `;

    const quote = getQuotePreview(content, {
      channel: 'tutumood',
      channelTitle: 'Levitating',
      hdImageBase: 'https://image.buxx.me',
    });

    expect(quote).not.toBeNull();
    expect(quote?.href).toBe('/mood/3408');
    expect(quote?.thumbnailSrc).toBe('/static/https:/cdn5.telesco.pe/file/reply-video-thumb.jpg');
  });
});

describe('getRelatedLinks', () => {
  test('skips inline anchors and internal site links for newsletters', () => {
    const links = getRelatedLinks(
      {
        content: [
          '<p><a href="https://example.org/article">inline source</a></p>',
          '<p>https://buxx.me/mood/123</p>',
          '<p>https://example.net/plain</p>',
          '<img src="https://image.buxx.me/mood/123/0" alt="" />',
        ].join(''),
      },
      {
        baseUrl: 'https://buxx.me',
        excludeInlineAnchors: true,
        excludeInternalLinks: true,
      }
    );

    expect(links).toEqual([
      { url: 'https://image.buxx.me/mood/123/0', type: 'image' },
      { url: 'https://example.net/plain', type: 'link' },
    ]);
  });
});
