import type { ChannelInfo, Post } from './telegram';

const DEFAULT_MOOD_ID = '990001';
const MULTI_IMAGE_MOOD_ID = '990777';

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

export interface E2EProject {
  name: string;
  url: string;
  description: string;
  role: 'Author' | 'Contributor';
  tags: string[];
  stars: number | null;
}

export interface E2EWritingTag {
  id: string;
  name: string;
  slug: string;
  visibility: 'public' | 'internal';
}

export interface E2EWritingPost {
  id: string;
  title: string;
  url: string;
  published_at: string;
  tags: E2EWritingTag[];
}

function readEnvFlag(locals: any, name: string): string {
  const processValue = process.env[name];
  if (typeof processValue === 'string' && processValue.trim()) {
    return processValue;
  }

  const buildValue = import.meta.env[name];
  if (typeof buildValue === 'string' && buildValue.trim()) {
    return buildValue;
  }

  const runtimeValue = locals?.runtime?.env?.[name] ?? locals?.env?.[name];
  if (typeof runtimeValue === 'string') {
    return runtimeValue;
  }

  return '';
}

export function isE2ESiteFixtureEnabled(locals: any): boolean {
  return readEnvFlag(locals, 'E2E_SITE_FIXTURE') === '1';
}

export function createE2EPost(id = DEFAULT_MOOD_ID): Post {
  if (id === MULTI_IMAGE_MOOD_ID) {
    return {
      id,
      title: `E2E Mood ${id}`,
      type: 'text',
      datetime: '2026-02-10T13:00:00+00:00',
      tags: ['e2e'],
      text: 'E2E multi-image mood',
      content: createE2EMultiImageContent(id),
      reactions: [],
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
    reactions: [],
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

export function createE2EProjects(): E2EProject[] {
  return [
    {
      name: 'TutuBetterRules',
      url: 'https://github.com/bunizao/TutuBetterRules',
      description: 'Proxy rules for Surge, Clash, and other proxy tools',
      role: 'Author',
      tags: ['Proxy', 'Network'],
      stars: 128,
    },
    {
      name: 'Attegi',
      url: 'https://github.com/bunizao/Attegi',
      description: 'A minimal and elegant Ghost theme',
      role: 'Author',
      tags: ['Ghost', 'Theme', 'TailwindCSS'],
      stars: 64,
    },
  ];
}

export function createE2EWritingPosts(): E2EWritingPost[] {
  return [
    {
      id: 'ghost-post-1',
      title: 'Designing a fast personal site',
      url: 'https://blog.buxx.me/designing-a-fast-personal-site/',
      published_at: '2026-02-01T08:00:00.000Z',
      tags: [
        {
          id: 'tag-design',
          name: 'Design',
          slug: 'design',
          visibility: 'public',
        },
      ],
    },
    {
      id: 'ghost-post-2',
      title: 'Running Telegram mood feeds at scale',
      url: 'https://blog.buxx.me/running-telegram-mood-feeds-at-scale/',
      published_at: '2026-01-15T08:00:00.000Z',
      tags: [
        {
          id: 'tag-automation',
          name: 'Automation',
          slug: 'automation',
          visibility: 'public',
        },
      ],
    },
  ];
}
