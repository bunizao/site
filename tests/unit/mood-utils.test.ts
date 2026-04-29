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
