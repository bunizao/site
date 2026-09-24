import { describe, expect, test } from 'bun:test';
import { buildMoodFeedItem } from '../../src/features/mood/server/feed-service';
import type { ChannelInfo, Post } from '../../src/features/mood/server/legacy-types';
import {
  getFirstImageMeta,
  getFirstVideoPosterSrc,
  getInlineMediaPreview,
  getQuotePreview,
  getTextPreview,
  getTextPreviewHtml,
  hasEmojiImageMedia,
  hasMedia,
  hasTooBigVideo,
  isLongContent,
} from '../../src/features/mood/shared/utils';
import { getMoodGallery } from '../../src/features/mood/shared/gallery';
import type { MediaItem } from '@bunizao/contracts';

// This suite pins buildMoodFeedItem's output to the pre-refactor behavior:
// every helper re-parsing post.content on its own (~8 cheerio.load calls per
// post) instead of sharing one parsed document. Each helper stays backward
// compatible when called with a raw string, so `buildOld` below reconstructs
// that exact old code path using the current helper implementations. Any
// regression in the shared-$/clone wiring (wrong order, a leaked mutation,
// etc.) will show up as a mismatch here.

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

function getLocalMoodId(href: string | undefined): string {
  if (!href) return '';
  try {
    const url = new URL(href, 'https://local.invalid');
    const match = url.pathname.match(/^\/mood\/(\d+)$/);
    return match?.[1] ?? '';
  } catch {
    return '';
  }
}

async function buildOld(post: Post, channelInfo: ChannelInfo) {
  const mediaPreview = getInlineMediaPreview(post.content);
  const tooBigVideo = hasTooBigVideo(post.content);
  const previewText = getTextPreview(post);
  const previewHtml = getTextPreviewHtml(post);
  const gallery = getMoodGallery(post.content);
  const leadItem = gallery?.items[0] ?? null;
  const imageMeta = getFirstImageMeta(post.content);
  const media: MediaItem[] = gallery?.items.map((item, index) => ({
    id: `legacy-${post.id}-${index}`,
    type: 'image',
    src: item.src,
    fallbackSrc: item.fallbackSrc,
    width: item.width,
    height: item.height,
    layout: item.layout,
    alt: item.alt,
  })) ?? [];
  const rawQuote = getQuotePreview(post.content, {
    channel: 'tutumood',
    channelTitle: channelInfo.title?.trim() ?? '',
    hdImageBase: 'https://image.buxx.me',
  });
  const quote = rawQuote ? { ...rawQuote } : null;
  const quoteTargetId = getLocalMoodId(quote?.href);
  const quoteTargetPost = quoteTargetId
    ? channelInfo.posts?.find((candidate) => candidate.id === quoteTargetId)
    : null;
  const quoteTargetVideoPoster = quoteTargetPost ? getFirstVideoPosterSrc(quoteTargetPost.content) : null;
  if (quote && quoteTargetVideoPoster) {
    quote.thumbnailSrc = quoteTargetVideoPoster;
  }
  const hasUnsupportedMedia = post.content.includes('mood-unsupported-media-card');
  const hasDetailMedia = hasUnsupportedMedia || hasMedia(post.content) || hasEmojiImageMedia(post.content);
  const needsDetailPage = !mediaPreview && (hasDetailMedia || tooBigVideo || isLongContent(previewText));

  return {
    id: post.id,
    datetime: post.datetime,
    tag: post.tags?.[0] ?? '',
    previewText,
    previewHtml,
    previewMediaType: tooBigVideo ? 'too-big-video' : '',
    media,
    gallery: mediaPreview ? null : gallery,
    image: mediaPreview ? null : leadItem?.src ?? imageMeta.src,
    imageFallback: mediaPreview ? null : leadItem?.fallbackSrc ?? imageMeta.fallbackSrc,
    imageWidth: mediaPreview ? null : leadItem?.width ?? imageMeta.width,
    imageHeight: mediaPreview ? null : leadItem?.height ?? imageMeta.height,
    imageLayout: mediaPreview ? null : leadItem?.layout ?? imageMeta.layout,
    imageKind: mediaPreview ? null : imageMeta.kind,
    mediaHtml: mediaPreview?.html ?? '',
    needsDetailPage,
    forwardedFrom: post.forwardedFrom ?? null,
    quote: quote ?? null,
    reactions: post.reactions?.map((reaction) => ({
      emoji: reaction.emoji,
      emojiId: reaction.emojiId,
      emojiImage: reaction.emojiImage,
      count: reaction.count,
      isPaid: reaction.isPaid,
    })) ?? [],
    commentsCount: post.commentsCount ?? 0,
  };
}

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

const staticPhoto = createPost(
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
);

const multiPhoto = createPost(
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
);

const videoPost = createPost(
  '4103',
  `
    <video
      src="/static/https:/cdn5.telesco.pe/file/video.mp4"
      poster="/static/https:/cdn5.telesco.pe/file/video-poster.jpg"
    ></video>
    video post
  `,
  'video post'
);

const documentPost = createPost(
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
);

const locationPost = createPost(
  '4106',
  `
    <a class="tgme_widget_message_location_wrap" href="https://foursquare.com/v/example">
      <div class="tgme_widget_message_location" style="background-image:url('/static/map.jpg')"></div>
      <div class="tgme_widget_message_location_info">
        <div class="tgme_widget_message_location_title" dir="auto">Mannings Venetian</div>
        <div class="tgme_widget_message_location_address" dir="auto">Macau</div>
      </div>
    </a>
  `
);

const unsupportedMediaPost = createPost(
  '3568',
  `
    <a class="mood-detail-quote mood-item-quote mood-comment-quote mood-unsupported-media-card" href="https://t.me/tutumood/3568">
      <div class="mood-detail-quote-meta mood-item-quote-meta">
        <span class="mood-detail-quote-source mood-item-quote-author">Telegram</span>
      </div>
      <p class="mood-detail-quote-text mood-item-quote-text">Open Telegram to view this media</p>
    </a>
  `
);

// Exercises the mutation-heavy previewHtml path together in the same post:
// custom emoji (kept + rewritten) and a bookmark card (stripped in preview
// text, preserved in preview HTML by getTextPreviewHtml's default options).
const richTextPost = createPost(
  '3600',
  `
    <p>Telegram <strong>Bot API</strong> rich text — <em>full coverage</em> demo.</p>
    <p>Inline <code>code()</code> sits next to a custom emoji
      <span class="tg-emoji" data-emoji-id="5458403743835889060">😂</span> on the same line.</p>
    <div class="bookmark-card bookmark-card--side-media"><span class="bookmark-card__title">A bookmark</span></div>
  `,
  'Telegram Bot API rich text — full coverage demo.'
);

const quotingStaticPhoto = createPost(
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
);

const quotingVideo = createPost(
  '4203',
  `
    <a class="tgme_widget_message_reply" href="/mood/4103">
      <div class="tgme_widget_message_reply_text">video post</div>
      <span class="tgme_widget_message_reply_thumb"></span>
    </a>
    quoted video
  `
);

const fixturePosts = [
  staticPhoto,
  multiPhoto,
  videoPost,
  documentPost,
  locationPost,
  unsupportedMediaPost,
  richTextPost,
  quotingStaticPhoto,
  quotingVideo,
];

describe('buildMoodFeedItem shared-$ parsing matches the old per-helper path', () => {
  const channelInfo = createChannelInfo(fixturePosts);

  for (const post of fixturePosts) {
    test(`post ${post.id} (${post.tags?.[0] ?? 'no tag'})`, async () => {
      const oldItem = await buildOld(post, channelInfo);
      const newItem = await buildMoodFeedItem(context, post, channelInfo);

      expect(newItem).toEqual(oldItem);
    });
  }
});
