import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const DETAIL_HTML_BY_URL: Record<string, string> = {
  'https://t.me/imagebuxx/3332?embed=1&mode=tme': `
    <div class="tgme_channel_info_header_title">Image Buxx</div>
    <div class="tgme_widget_message_wrap">
      <div class="tgme_widget_message text_not_supported_wrap" data-post="imagebuxx/3332">
        <a
          class="tgme_widget_message_photo_wrap"
          style="background-image:url('https://cdn5.telesco.pe/file/3332.jpg'); width:800px; padding-top:74.63%;"
        ></a>
        <div class="tgme_widget_message_text js-message_text">maccas!</div>
        <div class="tgme_widget_message_date">
          <time datetime="2026-04-07T14:06:18+00:00"></time>
        </div>
      </div>
    </div>
  `,
  'https://t.me/imagebuxx/3327?embed=1&mode=tme': `
    <div class="tgme_channel_info_header_title">Image Buxx</div>
    <div class="tgme_widget_message_wrap">
      <div class="tgme_widget_message text_not_supported_wrap" data-post="imagebuxx/3327">
        <div class="message_media_not_supported_wrap">
          <div class="message_media_not_supported">
            <div class="message_media_not_supported_label">Please open Telegram to view this post</div>
            <a href="https://t.me/imagebuxx/3327" class="message_media_view_in_telegram">VIEW IN TELEGRAM</a>
          </div>
        </div>
        <div class="tgme_widget_message_text js-message_text">live photo</div>
        <div class="tgme_widget_message_date">
          <time datetime="2026-04-07T06:50:10+00:00"></time>
        </div>
      </div>
    </div>
  `,
  'https://t.me/imagebuxx/3315?embed=1&mode=tme': `
    <div class="tgme_channel_info_header_title">Image Buxx</div>
    <div class="tgme_widget_message_wrap">
      <div class="tgme_widget_message text_not_supported_wrap" data-post="imagebuxx/3315">
        <a class="tgme_widget_message_reply" href="https://t.me/imagebuxx/3314">
          <div class="tgme_widget_message_author accent_color">
            <span class="tgme_widget_message_author_name" dir="auto">Image Buxx</span>
          </div>
          <div class="tgme_widget_message_text js-message_reply_text" dir="auto">reply text only</div>
        </a>
        <div class="tgme_widget_message_text js-message_text">body text</div>
        <div class="tgme_widget_message_date">
          <time datetime="2026-04-07T06:50:10+00:00"></time>
        </div>
      </div>
    </div>
  `,
};

const ofetchMock = mock(async (url: string) => {
  if (url.includes('&discussion=1&comments_limit=1')) {
    return `
      <div class="tgme_post_discussion_header">
        <span class="js-header">0 comments</span>
      </div>
    `;
  }

  const html = DETAIL_HTML_BY_URL[url];
  if (!html) {
    throw new Error(`Unexpected Telegram URL: ${url}`);
  }
  return html;
});

mock.module('ofetch', () => ({
  $fetch: ofetchMock,
}));

const originalFetch = globalThis.fetch;

const headFetchMock = mock(async () => {
  return new Response(null, { status: 200 });
});

const astro = {
  request: new Request('http://localhost:4321'),
  locals: {
    runtime: {
      env: {
        CHANNEL: 'imagebuxx',
        PUBLIC_HD_IMAGE_URL: 'https://image.buxx.me',
      },
    },
  },
};

const telegramModulePromise = import('../../src/lib/telegram');

beforeEach(() => {
  ofetchMock.mockClear();
  headFetchMock.mockClear();
  globalThis.fetch = headFetchMock as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  mock.restore();
});

describe('getChannelInfo detail media rendering', () => {
  test('does not duplicate fallback media when a photo already exists', async () => {
    const { getChannelInfo } = await telegramModulePromise;
    const post = await getChannelInfo(astro, { id: '3332', skipCache: true });

    expect(typeof post).toBe('object');
    expect((post as { content: string }).content.match(/image-preview-wrap/g)?.length).toBe(1);
    expect((post as { content: string }).content).not.toContain('modal-3332-unsupported');
  });

  test('renders unsupported live photo fallback inside the standard image container markup', async () => {
    const { getChannelInfo } = await telegramModulePromise;
    const post = await getChannelInfo(astro, { id: '3327', skipCache: true });
    const content = (post as { content: string }).content;

    expect(content).toContain('image-list-container image-list-odd');
    expect(content).toContain('image-preview-wrap image-preview-wrap--fallback');
    expect(content).toContain('style="aspect-ratio:auto;"');
    expect(content).toContain('modal-3327-unsupported');
    expect(content).not.toContain('Open Telegram to view this live photo');
    expect(headFetchMock).not.toHaveBeenCalled();
  });

  test('does not invent a reply thumbnail when Telegram reply markup has text only', async () => {
    const { getChannelInfo } = await telegramModulePromise;
    const post = await getChannelInfo(astro, { id: '3315', skipCache: true });
    const content = (post as { content: string }).content;

    expect(content).toContain('reply text only');
    expect(content).not.toContain('mood-detail-quote-image');
    expect(content).not.toContain('https://image.buxx.me/mood/3314/0');
    expect(content).not.toContain('Open Telegram to view this live photo');
    expect(content).not.toContain('mood-unsupported-media-card');
  });
});
