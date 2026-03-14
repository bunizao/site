import type { ChannelInfo, Post } from './telegram';

const DEFAULT_MOOD_ID = '990001';

function readEnvFlag(locals: any, name: string): string {
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
