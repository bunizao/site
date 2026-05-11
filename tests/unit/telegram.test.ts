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
  'https://t.me/imagebuxx/3333?embed=1&mode=tme': `
    <div class="tgme_channel_info_header_title">Image Buxx</div>
    <div class="tgme_widget_message_wrap">
      <div class="tgme_widget_message text_not_supported_wrap" data-post="imagebuxx/3333">
        <a
          class="tgme_widget_message_photo_wrap grouped_media_wrap"
          style="background-image:url('https://cdn5.telesco.pe/file/3333-a.jpg'); width:800px; padding-top:75%;"
        ></a>
        <a
          class="tgme_widget_message_photo_wrap grouped_media_wrap"
          style="background-image:url('https://cdn5.telesco.pe/file/3333-b.jpg'); width:800px; padding-top:75%;"
        ></a>
        <div class="tgme_widget_message_text js-message_text">multi photo</div>
        <div class="tgme_widget_message_date">
          <time datetime="2026-04-07T14:06:18+00:00"></time>
        </div>
      </div>
    </div>
  `,
  'https://t.me/imagebuxx/3408?embed=1&mode=tme': `
    <div class="tgme_channel_info_header_title">Image Buxx</div>
    <div class="tgme_widget_message_wrap">
      <div class="tgme_widget_message text_not_supported_wrap" data-post="imagebuxx/3408">
        <a class="tgme_widget_message_video_player js-message_video_player" href="https://t.me/imagebuxx/3408">
          <i
            class="tgme_widget_message_video_thumb"
            style="background-image:url('https://cdn5.telesco.pe/file/video-poster.jpg')"
          ></i>
          <div class="tgme_widget_message_video_wrap" style="width:1626px;padding-top:45.51%">
            <video src="https://cdn5.telesco.pe/file/video.mp4" class="tgme_widget_message_video js-message_video"></video>
          </div>
          <div class="message_media_not_supported_wrap">
            <div class="message_media_not_supported">
              <div class="message_media_not_supported_label">This media is not supported in your browser</div>
            </div>
          </div>
        </a>
        <div class="tgme_widget_message_text js-message_text">video post</div>
        <div class="tgme_widget_message_date">
          <time datetime="2026-04-25T18:51:27+00:00"></time>
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
        <div class="tgme_widget_message_date">
          <time datetime="2026-04-07T06:50:10+00:00"></time>
        </div>
      </div>
    </div>
  `,
  'https://t.me/imagebuxx/3328?embed=1&mode=tme': `
    <div class="tgme_channel_info_header_title">Image Buxx</div>
    <div class="tgme_widget_message_wrap">
      <div class="tgme_widget_message text_not_supported_wrap" data-post="imagebuxx/3328">
        <a class="tgme_widget_message_reply" href="https://t.me/imagebuxx/3327">
          <div class="tgme_widget_message_author accent_color">
            <span class="tgme_widget_message_author_name" dir="auto">Image Buxx</span>
          </div>
          <div class="tgme_widget_message_text js-message_reply_text" dir="auto">海</div>
        </a>
        <div class="tgme_widget_message_text js-message_text">在这里<br/>主播因为太忧郁被要 ig 了</div>
        <div class="tgme_widget_message_date">
          <time datetime="2026-04-07T06:54:41+00:00"></time>
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
  'https://t.me/imagebuxx/3421?embed=1&mode=tme': `
    <div class="tgme_channel_info_header_title">Image Buxx</div>
    <div class="tgme_widget_message_wrap">
      <div class="tgme_widget_message text_not_supported_wrap" data-post="imagebuxx/3421">
        <a class="tgme_widget_message_reply" href="https://t.me/imagebuxx/3420">
          <div class="tgme_widget_message_author accent_color">
            <span class="tgme_widget_message_author_name" dir="auto">Image Buxx</span>
          </div>
          <div class="tgme_widget_message_text js-message_reply_text" dir="auto">quoted detail text</div>
        </a>
        <div class="tgme_widget_message_text js-message_text">body text should start after the quote</div>
        <div class="tgme_widget_message_date">
          <time datetime="2026-04-29T06:50:10+00:00"></time>
        </div>
      </div>
    </div>
  `,
  'https://t.me/imagebuxx/3410?embed=1&mode=tme': `
    <div class="tgme_channel_info_header_title">Image Buxx</div>
    <div class="tgme_widget_message_wrap">
      <div class="tgme_widget_message text_not_supported_wrap" data-post="imagebuxx/3410">
        <a class="tgme_widget_message_reply" href="https://t.me/imagebuxx/3408">
          <i
            class="tgme_widget_message_reply_thumb"
            style="background-image:url('https://cdn5.telesco.pe/file/reply-video-thumb.jpg')"
          ></i>
          <div class="tgme_widget_message_author accent_color">
            <span class="tgme_widget_message_author_name" dir="auto">Image Buxx</span>
          </div>
          <div class="tgme_widget_message_text js-message_reply_text" dir="auto">科研成果</div>
        </a>
        <div class="tgme_widget_message_text js-message_text">body text</div>
        <div class="tgme_widget_message_date">
          <time datetime="2026-04-26T09:36:12+00:00"></time>
        </div>
      </div>
    </div>
  `,
  'https://t.me/imagebuxx/3417?embed=1&mode=tme': `
    <div class="tgme_channel_info_header_title">Image Buxx</div>
    <div class="tgme_widget_message_wrap">
      <div class="tgme_widget_message text_not_supported_wrap" data-post="imagebuxx/3417">
        <div class="message_media_not_supported_wrap">
          <div class="message_media_not_supported">
            <div class="message_media_not_supported_label">Please open Telegram to view this post</div>
            <a href="https://t.me/imagebuxx/3417" class="message_media_view_in_telegram">VIEW IN TELEGRAM</a>
          </div>
        </div>
        <i
          class="tgme_widget_message_sticker"
          data-webp="https://cdn5.telesco.pe/file/sticker.webp"
        ></i>
        <div class="tgme_widget_message_date">
          <time datetime="2026-04-27T10:06:52+00:00"></time>
        </div>
      </div>
    </div>
  `,
};

const DISCUSSION_HTML_BY_URL: Record<string, string> = {
  'https://t.me/imagebuxx/3332?embed=1&discussion=1&comments_limit=20': `
    <div class="tgme_widget_message_wrap">
      <div class="tgme_widget_message" data-post="imagebuxx/9001" data-post-id="9001">
        <a class="tgme_widget_message_user_photo">
          <img src="https://cdn5.telesco.pe/file/avatar.jpg" alt="">
        </a>
        <a class="tgme_widget_message_author_name">Photo Author</a>
        <a
          class="tgme_widget_message_photo_wrap grouped_media_wrap blured js-message_photo"
          style="left:0px;top:0px;width:277px;height:604px;background-image:url('https://cdn5.telesco.pe/file/comment-photo.jpg')"
        ></a>
        <div class="tgme_widget_message_date">
          <time datetime="2026-04-19T15:28:19+00:00"></time>
        </div>
      </div>
    </div>
  `,
};

const PAGE_HTML_BY_URL: Record<string, string> = {
  'https://t.me/imagebuxx/3327': `
    <html>
      <head>
        <meta property="og:title" content="Image Buxx">
        <meta property="og:image" content="https://cdn5.telesco.pe/file/3327.jpg">
        <meta property="og:description" content="海">
      </head>
    </html>
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

  const html = DISCUSSION_HTML_BY_URL[url] ?? DETAIL_HTML_BY_URL[url] ?? PAGE_HTML_BY_URL[url];
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

function asFetchMock(fetchMock: typeof headFetchMock): typeof fetch {
  return fetchMock as unknown as typeof fetch;
}

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

const telegramModulePromise = import('../../src/features/mood/server/telegram-source');

beforeEach(() => {
  ofetchMock.mockClear();
  headFetchMock.mockClear();
  globalThis.fetch = asFetchMock(headFetchMock);
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

  test('renders all grouped static photos without unsupported fallback media', async () => {
    const { getChannelInfo } = await telegramModulePromise;
    const post = await getChannelInfo(astro, { id: '3333', skipCache: true });
    const content = (post as { content: string }).content;

    expect(content.match(/image-preview-wrap/g)?.length).toBe(2);
    expect(content).toContain('https://image.buxx.me/mood/3333/0');
    expect(content).toContain('https://image.buxx.me/mood/3333/1');
    expect(content).toContain('/static/https:/cdn5.telesco.pe/file/3333-a.jpg?w=1280');
    expect(content).toContain('/static/https:/cdn5.telesco.pe/file/3333-b.jpg?w=1280');
    expect(content).not.toContain('modal-3333-unsupported');
  });

  test('renders playable videos instead of unsupported fallback media', async () => {
    const { getChannelInfo } = await telegramModulePromise;
    const post = await getChannelInfo(astro, { id: '3408', skipCache: true });
    const content = (post as { content: string }).content;

    expect(content).toContain('<video');
    expect(content).toContain('/static/https:/cdn5.telesco.pe/file/video.mp4');
    expect(content).toContain('poster="/static/https:/cdn5.telesco.pe/file/video-poster.jpg"');
    expect(content).not.toContain('image-preview-wrap--fallback');
    expect(content).not.toContain('https://image.buxx.me/mood/3408/0');
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

  test('recovers live photo caption from Telegram share metadata when embed text is missing', async () => {
    const { getChannelInfo } = await telegramModulePromise;
    const post = await getChannelInfo(astro, { id: '3327', skipCache: true });
    const content = (post as { content: string; text: string; title: string }).content;

    expect((post as { text: string }).text).toBe('海');
    expect((post as { title: string }).title).toBe('海');
    expect(content).toContain('<p>海</p>');
  });

  test('renders unsupported live photo fallback even when runtime fetch fails', async () => {
    globalThis.fetch = asFetchMock(mock(async () => {
      throw new Error('network down');
    }));

    const { getChannelInfo } = await telegramModulePromise;
    const post = await getChannelInfo(astro, { id: '3327', skipCache: true });
    const content = (post as { content: string }).content;

    expect(content).toContain('https://image.buxx.me/mood/3327/0');
    expect(content).toContain('image-preview-wrap image-preview-wrap--fallback');
    expect(content).not.toContain('Open Telegram to view this live photo');
  });

  test('adds a quote thumbnail when the quoted target is unsupported live photo media', async () => {
    const { getChannelInfo } = await telegramModulePromise;
    const post = await getChannelInfo(astro, { id: '3328', skipCache: true });
    const content = (post as { content: string }).content;

    expect(content).toContain('mood-detail-quote--with-media');
    expect(content).toContain('mood-detail-quote-image');
    expect(content).toContain('https://image.buxx.me/mood/3327/0');
    expect(content).toContain('海');
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

  test('renders detail reply cards with the shared mood quote structure', async () => {
    const { getChannelInfo } = await telegramModulePromise;
    const post = await getChannelInfo(astro, { id: '3421', skipCache: true });
    const content = (post as { content: string }).content;

    expect(content).toContain('mood-detail-quote mood-item-quote mood-comment-quote');
    expect(content).toContain('mood-detail-quote-body mood-item-quote-body');
    expect(content).toContain('mood-detail-quote-text mood-item-quote-text');
    expect(content).not.toContain('mood-item-quote-author');
    expect(content).toContain('body text should start after the quote');
  });

  test('uses the inline Telegram reply thumbnail before HD fallback guesses', async () => {
    const { getChannelInfo } = await telegramModulePromise;
    const post = await getChannelInfo(astro, { id: '3410', skipCache: true });
    const content = (post as { content: string }).content;

    expect(content).toContain('/static/https:/cdn5.telesco.pe/file/reply-video-thumb.jpg');
    expect(content).not.toContain('https://image.buxx.me/mood/3408/0');
  });

  test('does not add unsupported media fallback when sticker media exists', async () => {
    const { getChannelInfo } = await telegramModulePromise;
    const post = await getChannelInfo(astro, { id: '3417', skipCache: true });
    const content = (post as { content: string }).content;

    expect(content).toContain('class="sticker"');
    expect(content).toContain('/static/https:/cdn5.telesco.pe/file/sticker.webp');
    expect(content).not.toContain('image-preview-wrap--fallback');
    expect(content).not.toContain('https://image.buxx.me/mood/3417/0');
  });
});

describe('getPostComments media rendering', () => {
  test('renders image media from Telegram comments', async () => {
    const { getPostComments } = await telegramModulePromise;
    const result = await getPostComments(astro, { postId: '3332' });

    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].content).toContain('image-list-container image-list-odd');
    expect(result.comments[0].content).toContain('image-preview-wrap image-preview-wrap--portrait');
    expect(result.comments[0].content).toContain('/static/https:/cdn5.telesco.pe/file/comment-photo.jpg?w=1280');
  });
});
