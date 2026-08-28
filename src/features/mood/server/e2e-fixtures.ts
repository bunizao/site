import type { ChannelInfo, Post } from '@/features/mood/server/legacy-types';

const DEFAULT_MOOD_ID = '990001';
const MULTI_IMAGE_MOOD_ID = '990777';
const SINGLE_IMAGE_MOOD_ID = '990778';
const E2E_REACTIONS = [
  {
    emoji: '👍',
    count: '4',
    isPaid: false,
  },
];

function createE2EMultiImageContent(id: string): string {
  return [
    '<p>E2E multi-image detail post</p>',
    '<div class="image-list-container image-list-odd">',
    `  <button class="image-preview-button image-preview-wrap image-preview-wrap--portrait" style="--image-width:720px;--image-height:960px" popovertarget="modal-${id}-0" popovertargetaction="show">`,
    '    <img src="https://image.example.test/mood/990777/0" data-fallback-src="/static/https://cdn4.telesco.pe/file/e2e-0.jpg" alt="" width="720" height="960" loading="lazy" />',
    '  </button>',
    `  <button class="image-preview-button modal" id="modal-${id}-0" popovertarget="modal-${id}-0" popovertargetaction="hide" popover>`,
    '    <img class="modal-img" src="https://image.example.test/mood/990777/0" alt="" loading="lazy" />',
    '  </button>',
    `  <button class="image-preview-button image-preview-wrap" style="--image-width:1200px;--image-height:900px" popovertarget="modal-${id}-1" popovertargetaction="show">`,
    '    <img src="https://image.example.test/mood/990777/1" data-fallback-src="/static/https://cdn4.telesco.pe/file/e2e-1.jpg" alt="" width="1200" height="900" loading="lazy" />',
    '  </button>',
    `  <button class="image-preview-button modal" id="modal-${id}-1" popovertarget="modal-${id}-1" popovertargetaction="hide" popover>`,
    '    <img class="modal-img" src="https://image.example.test/mood/990777/1" alt="" loading="lazy" />',
    '  </button>',
    `  <button class="image-preview-button image-preview-wrap image-preview-wrap--ultra-tall" style="--image-width:540px;--image-height:1200px" popovertarget="modal-${id}-2" popovertargetaction="show">`,
    '    <img src="https://image.example.test/mood/990777/2" data-fallback-src="/static/https://cdn4.telesco.pe/file/e2e-2.jpg" alt="" width="540" height="1200" loading="lazy" />',
    '  </button>',
    `  <button class="image-preview-button modal" id="modal-${id}-2" popovertarget="modal-${id}-2" popovertargetaction="hide" popover>`,
    '    <img class="modal-img" src="https://image.example.test/mood/990777/2" alt="" loading="lazy" />',
    '  </button>',
    '</div>',
    '<p>Detail text continues after the gallery.</p>',
  ].join('');
}

function createE2ESingleImageContent(id: string): string {
  return [
    '<p>E2E single-image detail post</p>',
    `<button class="image-preview-button image-preview-wrap image-preview-wrap--portrait" style="--image-width:589px;--image-height:1280px" popovertarget="modal-${id}-0" popovertargetaction="show">`,
    `  <img src="/api/v2/images/mood/${id}/0" alt="" width="589" height="1280" loading="lazy" />`,
    '</button>',
    `<button class="image-preview-button modal" id="modal-${id}-0" popovertarget="modal-${id}-0" popovertargetaction="hide" popover>`,
    `  <img class="modal-img" src="/api/v2/images/mood/${id}/0" alt="" loading="lazy" />`,
    '</button>',
    '<p>Detail text continues after the image.</p>',
  ].join('');
}

export function createE2EPost(id = DEFAULT_MOOD_ID): Post {
  if (id === SINGLE_IMAGE_MOOD_ID) {
    return {
      id,
      title: `E2E Mood ${id}`,
      type: 'text',
      datetime: '2026-02-10T13:00:00+00:00',
      tags: ['e2e'],
      text: 'E2E single-image mood',
      content: createE2ESingleImageContent(id),
      reactions: E2E_REACTIONS,
      commentsCount: 1,
    };
  }

  if (id === MULTI_IMAGE_MOOD_ID) {
    return {
      id,
      title: `E2E Mood ${id}`,
      type: 'text',
      datetime: '2026-02-10T13:00:00+00:00',
      tags: ['e2e'],
      text: 'E2E multi-image mood',
      content: createE2EMultiImageContent(id),
      reactions: E2E_REACTIONS,
      commentsCount: 1,
    };
  }

  return {
    id,
    title: `E2E Mood ${id}`,
    type: 'text',
    datetime: '2026-02-10T13:00:00+00:00',
    tags: ['e2e'],
    text: `E2E fallback mood ${id}`,
    content: `<p>E2E fallback mood ${id}</p>`,
    reactions: E2E_REACTIONS,
    commentsCount: 1,
  };
}

export function createE2EChannelInfo(ids: string[] = [DEFAULT_MOOD_ID]): ChannelInfo {
  return {
    posts: ids.map((id) => createE2EPost(id)),
    title: 'E2E Channel',
    titleHTML: 'E2E Channel',
    description: 'E2E fallback feed',
    descriptionHTML: 'E2E fallback feed',
    avatar: '',
  };
}

export function createE2EComments(postId: string) {
  return {
    comments: [
      {
        id: `${postId}-comment-1`,
        author: 'E2E',
        authorAvatar: '',
        datetime: '2026-02-10T13:10:00+00:00',
        content: '<p>E2E fallback comment</p>',
        reactions: [],
      },
    ],
    hasMore: false,
    nextBefore: '',
  };
}
