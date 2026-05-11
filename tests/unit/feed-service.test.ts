import { describe, expect, test } from 'bun:test';
import { buildMoodFeedItem } from '../../src/features/mood/server/feed-service';
import type { ChannelInfo, Post } from '../../src/features/mood/server/telegram-source';

const createPost = (id: string, content: string): Post => ({
  id,
  title: '',
  type: 'text',
  datetime: '2026-04-26T09:36:12+00:00',
  tags: [],
  text: '',
  content,
  reactions: [],
  commentsCount: 0,
});

describe('buildMoodFeedItem', () => {
  test('uses the target video poster for local quote thumbnails', async () => {
    const quotedPost = createPost(
      '3408',
      `
        <video
          src="/static/https:/cdn5.telesco.pe/file/video.mp4"
          poster="/static/https:/cdn5.telesco.pe/file/video-poster.jpg"
        ></video>
        科研成果
      `
    );
    const quotingPost = createPost(
      '3410',
      `
        <a class="tgme_widget_message_reply" href="/mood/3408">
          <div class="tgme_widget_message_reply_text">科研成果</div>
          <span class="tgme_widget_message_reply_thumb"></span>
        </a>
        接了 last.fm
      `
    );
    const channelInfo: ChannelInfo = {
      posts: [quotingPost, quotedPost],
      title: 'Levitating',
      titleHTML: '',
      description: '',
      descriptionHTML: '',
      avatar: '',
    };

    const item = await buildMoodFeedItem(
      {
        request: new Request('http://localhost:4321'),
        locals: {
          runtime: {
            env: {
              CHANNEL: 'tutumood',
              PUBLIC_HD_IMAGE_URL: 'https://image.buxx.me',
            },
          },
        },
      },
      quotingPost,
      channelInfo
    );

    expect(item.quote?.thumbnailSrc).toBe('/static/https:/cdn5.telesco.pe/file/video-poster.jpg');
  });

  test('keeps inline reply thumbnails when the target post is not loaded', async () => {
    const quotingPost = createPost(
      '3410',
      `
        <a class="tgme_widget_message_reply" href="/mood/3408">
          <i
            class="tgme_widget_message_reply_thumb"
            style="background-image:url('https://cdn5.telesco.pe/file/reply-video-thumb.jpg')"
          ></i>
          <div class="tgme_widget_message_reply_text">科研成果</div>
        </a>
        接了 last.fm
      `
    );
    const channelInfo: ChannelInfo = {
      posts: [quotingPost],
      title: 'Levitating',
      titleHTML: '',
      description: '',
      descriptionHTML: '',
      avatar: '',
    };

    const item = await buildMoodFeedItem(
      {
        request: new Request('http://localhost:4321'),
        locals: {
          runtime: {
            env: {
              CHANNEL: 'tutumood',
              PUBLIC_HD_IMAGE_URL: 'https://image.buxx.me',
            },
          },
        },
      },
      quotingPost,
      channelInfo
    );

    expect(item.quote?.thumbnailSrc).toBe('/static/https:/cdn5.telesco.pe/file/reply-video-thumb.jpg');
  });
});
