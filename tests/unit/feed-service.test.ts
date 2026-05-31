import { describe, expect, test } from 'bun:test';
import { buildMoodFeedItem } from '../../src/features/mood/server/feed-service';
import type { ChannelInfo, Post } from '../../src/features/mood/server/telegram-source';

const context = {
  request: new Request('http://localhost:4321'),
  locals: {
    runtime: {
      env: {
        CHANNEL: 'tutumood',
        PUBLIC_HD_IMAGE_URL: 'https://image.buxx.me',
      },
    },
  },
};

const contextWithoutHdImages = {
  request: new Request('http://localhost:4321'),
  locals: {
    runtime: {
      env: {
        CHANNEL: 'tutumood',
      },
    },
  },
};

const createPost = (id: string, content: string, text = ''): Post => ({
  id,
  title: '',
  type: 'text',
  datetime: '2026-04-26T09:36:12+00:00',
  tags: [],
  text,
  content,
  reactions: [],
  commentsCount: 0,
});

const createChannelInfo = (posts: Post[]): ChannelInfo => ({
  posts,
  title: 'Levitating',
  titleHTML: '',
  description: '',
  descriptionHTML: '',
  avatar: '',
});

describe('buildMoodFeedItem', () => {
  const mediaCases = [
    {
      name: 'static photo',
      post: createPost(
        '4101',
        `
          <div class="image-list-container image-list-odd">
            <button class="image-preview-wrap" style="--image-width:800px;--image-height:600px">
              <img
                src="https://image.buxx.me/mood/4101/0"
                data-fallback-src="/static/https:/cdn5.telesco.pe/file/static-photo.jpg?w=1280"
                width="800"
                height="600"
                alt="static photo"
              />
            </button>
          </div>
          static photo
        `,
        'static photo'
      ),
      expected: {
        image: 'https://image.buxx.me/mood/4101/0',
        imageFallback: '/static/https:/cdn5.telesco.pe/file/static-photo.jpg?w=1280',
        galleryCount: 1,
        mediaHtmlIncludes: '',
      },
    },
    {
      name: 'multi photo',
      post: createPost(
        '4102',
        `
          <div class="image-list-container image-list-even">
            <button class="image-preview-wrap">
              <img src="https://image.buxx.me/mood/4102/0" width="800" height="600" alt="first photo" />
            </button>
            <button class="image-preview-wrap">
              <img src="https://image.buxx.me/mood/4102/1" width="640" height="640" alt="second photo" />
            </button>
          </div>
          multi photo
        `,
        'multi photo'
      ),
      expected: {
        image: 'https://image.buxx.me/mood/4102/0',
        imageFallback: null,
        galleryCount: 2,
        mediaHtmlIncludes: '',
      },
    },
    {
      name: 'video',
      post: createPost(
        '4103',
        `
          <video
            src="/static/https:/cdn5.telesco.pe/file/video.mp4"
            poster="/static/https:/cdn5.telesco.pe/file/video-poster.jpg"
          ></video>
          video post
        `,
        'video post'
      ),
      expected: {
        image: null,
        imageFallback: null,
        galleryCount: 0,
        mediaHtmlIncludes: '/static/https:/cdn5.telesco.pe/file/video.mp4',
      },
    },
    {
      name: 'live photo fallback',
      post: createPost(
        '4104',
        `
          <div class="image-list-container image-list-odd">
            <button class="image-preview-wrap image-preview-wrap--fallback">
              <img src="https://image.buxx.me/mood/4104/0" alt="live photo" />
            </button>
          </div>
          live photo caption
        `,
        'live photo caption'
      ),
      expected: {
        image: 'https://image.buxx.me/mood/4104/0',
        imageFallback: null,
        galleryCount: 1,
        mediaHtmlIncludes: '',
      },
    },
    {
      name: 'document',
      post: createPost(
        '4105',
        `
          <a class="tgme_widget_message_document_wrap" href="https://t.me/tutumood/4105">
            <div class="tgme_widget_message_document_icon accent_bg"></div>
            <div class="tgme_widget_message_document">
              <div class="tgme_widget_message_document_title accent_color" dir="auto">My Vibe.pdf</div>
              <div class="tgme_widget_message_document_extra" dir="auto">113.9 KB</div>
            </div>
          </a>
        `
      ),
      expected: {
        image: null,
        imageFallback: null,
        galleryCount: 0,
        mediaHtmlIncludes: 'My Vibe.pdf',
      },
    },
  ] satisfies Array<{
    name: string;
    post: Post;
    expected: {
      image: string | null;
      imageFallback: string | null;
      galleryCount: number;
      mediaHtmlIncludes: string;
    };
  }>;

  for (const { name, post, expected } of mediaCases) {
    test(`renders non-quoted ${name} without quote data`, async () => {
      const item = await buildMoodFeedItem(context, post, createChannelInfo([post]));

      expect(item.quote).toBeNull();
      expect(item.image).toBe(expected.image);
      expect(item.imageFallback).toBe(expected.imageFallback);
      expect(item.gallery?.items.length ?? 0).toBe(expected.galleryCount);
      if (expected.mediaHtmlIncludes) {
        expect(item.mediaHtml).toContain(expected.mediaHtmlIncludes);
      } else {
        expect(item.mediaHtml).toBe('');
      }
    });
  }

  const quoteCases = [
    {
      name: 'static photo quote',
      quotedPost: mediaCases[0].post,
      quotingPost: createPost(
        '4201',
        `
          <a class="tgme_widget_message_reply" href="/mood/4101">
            <i
              class="tgme_widget_message_reply_thumb"
              style="background-image:url('https://cdn5.telesco.pe/file/static-photo-thumb.jpg')"
            ></i>
            <div class="tgme_widget_message_reply_text">static photo</div>
          </a>
          quoted static photo
        `
      ),
      expectedThumbnail: '/static/https:/cdn5.telesco.pe/file/static-photo-thumb.jpg',
      forbiddenThumbnail: 'https://image.buxx.me/mood/4101/0',
    },
    {
      name: 'multi photo quote',
      quotedPost: mediaCases[1].post,
      quotingPost: createPost(
        '4202',
        `
          <a class="tgme_widget_message_reply" href="/mood/4102">
            <i
              class="tgme_widget_message_reply_thumb"
              style="background-image:url('https://cdn5.telesco.pe/file/multi-photo-thumb.jpg')"
            ></i>
            <div class="tgme_widget_message_reply_text">multi photo</div>
          </a>
          quoted multi photo
        `
      ),
      expectedThumbnail: '/static/https:/cdn5.telesco.pe/file/multi-photo-thumb.jpg',
      forbiddenThumbnail: 'https://image.buxx.me/mood/4102/0',
    },
    {
      name: 'video quote',
      quotedPost: mediaCases[2].post,
      quotingPost: createPost(
        '4203',
        `
          <a class="tgme_widget_message_reply" href="/mood/4103">
            <div class="tgme_widget_message_reply_text">video post</div>
            <span class="tgme_widget_message_reply_thumb"></span>
          </a>
          quoted video
        `
      ),
      expectedThumbnail: '/static/https:/cdn5.telesco.pe/file/video-poster.jpg',
      forbiddenThumbnail: 'https://image.buxx.me/mood/4103/0',
    },
    {
      name: 'live photo quote',
      quotedPost: mediaCases[3].post,
      quotingPost: createPost(
        '4204',
        `
          <a class="mood-detail-quote mood-item-quote mood-comment-quote mood-detail-quote--with-media mood-item-quote--with-media" href="/mood/4104">
            <span class="mood-detail-quote-media mood-item-quote-media">
              <img class="mood-detail-quote-image mood-item-quote-image" src="https://image.buxx.me/mood/4104/0" alt="" loading="lazy" />
            </span>
            <span class="mood-detail-quote-body mood-item-quote-body">
              <p class="mood-detail-quote-text mood-item-quote-text">live photo caption</p>
            </span>
          </a>
          quoted live photo
        `
      ),
      expectedThumbnail: 'https://image.buxx.me/mood/4104/0',
      forbiddenThumbnail: '',
    },
  ];

  for (const { name, quotedPost, quotingPost, expectedThumbnail, forbiddenThumbnail } of quoteCases) {
    test(`selects stable thumbnail for ${name}`, async () => {
      const item = await buildMoodFeedItem(
        context,
        quotingPost,
        createChannelInfo([quotingPost, quotedPost])
      );

      expect(item.quote?.href).toBe(`/mood/${quotedPost.id}`);
      expect(item.quote?.thumbnailSrc).toBe(expectedThumbnail);
      if (forbiddenThumbnail) {
        expect(item.quote?.thumbnailSrc).not.toBe(forbiddenThumbnail);
      }
    });
  }

  test('keeps quote text-only when a linked reply has no media', async () => {
    const quotingPost = createPost(
      '4205',
      `
        <a class="tgme_widget_message_reply" href="/mood/4105">
          <div class="tgme_widget_message_reply_text">plain text only</div>
        </a>
        quoted text
      `
    );
    const item = await buildMoodFeedItem(
      contextWithoutHdImages,
      quotingPost,
      createChannelInfo([quotingPost])
    );

    expect(item.quote?.href).toBe('/mood/4105');
    expect(item.quote?.text).toBe('plain text only');
    expect(item.quote?.thumbnailSrc).toBeUndefined();
  });
});
