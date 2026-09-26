import { afterAll, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';

const DETAIL_HTML_BY_URL: Record<string, string> = {
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

// A list page whose posts carry no replies element, so each one needs a
// discussion-embed lookup; that embed fails for both ids.
const LIST_URL = 'https://t.me/s/imagebuxx';
const FAILING_DISCUSSION_IDS = ['5001', '5002'];
const LIST_HTML = `
  <div class="tgme_channel_history">
    ${FAILING_DISCUSSION_IDS.map((id) => `
      <div class="tgme_widget_message_wrap">
        <div class="tgme_widget_message" data-post="imagebuxx/${id}">
          <div class="tgme_widget_message_text js-message_text">post ${id}</div>
          <div class="tgme_widget_message_date"><time datetime="2026-04-07T06:50:10+00:00"></time></div>
        </div>
      </div>
    `).join('')}
  </div>
`;

const ofetchMock = mock(async (url: string) => {
  if (url.includes('&discussion=1&comments_limit=1')) {
    if (FAILING_DISCUSSION_IDS.some((id) => url.includes(`/${id}?`))) {
      throw new Error('discussion embed unavailable');
    }
    return `
      <div class="tgme_post_discussion_header">
        <span class="js-header">0 comments</span>
      </div>
    `;
  }

  if (url === LIST_URL) return LIST_HTML;

  const html = DETAIL_HTML_BY_URL[url];
  if (!html) {
    throw new Error(`Unexpected Telegram URL: ${url}`);
  }
  return html;
});

mock.module('ofetch', () => ({
  $fetch: ofetchMock,
}));

const astro = {
  request: new Request('http://localhost:4321'),
  locals: {
    env: {
      CHANNEL: 'imagebuxx',
      PUBLIC_HD_IMAGE_URL: 'https://image.buxx.me',
    },
  },
};

const telegramModulePromise = import('../../src/features/mood/server/telegram-source');

beforeEach(() => {
  ofetchMock.mockClear();
});

afterAll(() => {
  mock.restore();
});

describe('getChannelInfo detail media rendering', () => {
  test('renders unsupported live photo fallback as HD image markup', async () => {
    const { getChannelInfo } = await telegramModulePromise;
    const post = await getChannelInfo(astro, { id: '3327', skipCache: true });
    const content = (post as { content: string }).content;

    expect(content).toContain('image-list-container image-list-odd');
    expect(content).toContain('image-preview-wrap image-preview-wrap--fallback');
    expect(content).toContain('style="aspect-ratio:auto;"');
    expect(content).toContain('modal-3327-unsupported');
    expect(content).toContain('https://buxx.me/api/v2/images/mood/3327/0');
    expect(content).not.toContain('mood-unsupported-media-card');
  });

  test('does not add unsupported media fallback when sticker media exists', async () => {
    const { getChannelInfo } = await telegramModulePromise;
    const post = await getChannelInfo(astro, { id: '3417', skipCache: true });
    const content = (post as { content: string }).content;

    expect(content).toContain('class="sticker"');
    expect(content).toContain('/static/https:/cdn5.telesco.pe/file/sticker.webp');
    expect(content).not.toContain('image-preview-wrap--fallback');
    expect(content).not.toContain('https://buxx.me/api/v2/images/mood/3417/0');
  });
});

describe('parseAbbreviatedCount', () => {
  test.each([
    ['12 comments', 12],
    ['1.2K comments', 1200],
    ['3M', 3_000_000],
    ['comments', null],
  ])('parses Telegram abbreviated counts: %p -> %p', async (text, expected) => {
    const { parseAbbreviatedCount } = await telegramModulePromise;
    expect(parseAbbreviatedCount(text)).toBe(expected);
  });
});

describe('getChannelInfo comment counts', () => {
  test('a failed comment-count lookup is not retried on the next list read', async () => {
    const { getChannelInfo } = await telegramModulePromise;
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {});
    try {
      await getChannelInfo(astro, { skipCache: true });
      const info = await getChannelInfo(astro, { skipCache: true }) as { posts: Array<{ id: string; commentsCount: number }> };

      expect(info.posts.map((post) => [post.id, post.commentsCount])).toEqual([['5002', 0], ['5001', 0]]);
      const discussionCalls = ofetchMock.mock.calls.filter(([url]) => url.includes('&discussion=1'));
      expect(discussionCalls).toHaveLength(FAILING_DISCUSSION_IDS.length);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
