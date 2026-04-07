import { describe, expect, test } from 'bun:test';
import { getFirstImage, getInlineMediaPreview, getQuotePreview, getTextPreview } from '../../src/lib/mood-utils';

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
