import {
  createE2EChannelInfo,
  createE2EComments,
  createE2EPost,
} from '@/features/mood/server/e2e-fixtures';
import { isE2ESiteFixtureEnabled } from '@/lib/e2e';
import { getNumericId } from '@/features/mood/shared/utils';
import { readEnv, readPublicEnv } from '@/lib/runtime/env';
import { getChannelInfo, readChannelSlug } from '@/features/mood/server/telegram-source';
import type { ChannelInfo, Post } from '@/features/mood/server/legacy-types';
import type { MoodCommentsPage } from './contracts';
import { normalizeMoodImageBase, normalizeMoodImageUrl } from './image-base';

export interface MoodServerContext {
  request: Request;
  locals?: any;
}

export interface LoadMoodChannelInput {
  before?: string;
  after?: string;
  skipCache?: boolean;
}

export interface MoodChannelSnapshot {
  channelInfo: ChannelInfo;
  posts: Post[];
}

export interface MoodPostSnapshot {
  post: Post | null;
  channelInfo: ChannelInfo | null;
}

function isPostResult(value: unknown): value is Post {
  return typeof value === 'object' && value !== null && 'id' in value && 'content' in value;
}

function sortMoodPosts(posts: Post[]): Post[] {
  return posts
    .filter((post) => post?.id)
    .sort((a, b) => getNumericId(b.id) - getNumericId(a.id));
}

export async function loadMoodChannelSnapshot(
  context: MoodServerContext,
  input: LoadMoodChannelInput = {}
): Promise<MoodChannelSnapshot> {
  const channelInfo = isE2ESiteFixtureEnabled(context.locals)
    ? createE2EChannelInfo()
    : await getChannelInfo(
        { request: context.request, locals: context.locals } as any,
        {
          type: 'list',
          before: input.before ?? '',
          after: input.after ?? '',
          skipCache: input.skipCache,
        }
      ) as ChannelInfo;

  return {
    channelInfo,
    posts: sortMoodPosts(channelInfo.posts ?? []),
  };
}

export async function loadMoodPostSnapshot(
  context: MoodServerContext,
  id: string
): Promise<MoodPostSnapshot> {
  if (isE2ESiteFixtureEnabled(context.locals)) {
    return {
      post: createE2EPost(id),
      channelInfo: createE2EChannelInfo([id]),
    };
  }

  const [postResult, channelInfo] = await Promise.all([
    getChannelInfo({ request: context.request, locals: context.locals } as any, { id }),
    getChannelInfo({ request: context.request, locals: context.locals } as any, { type: 'list' }),
  ]);

  return {
    post: isPostResult(postResult) ? postResult : null,
    channelInfo: channelInfo as ChannelInfo,
  };
}

export function getMoodChannelSlug(locals?: any): string {
  return readChannelSlug(locals);
}

export function getMoodChannelEmojiId(locals?: any): string {
  return readEnv(locals, 'CHANNEL_EMOJI_ID');
}

export function getMoodHdImageBase(locals?: any): string {
  return normalizeMoodImageBase(readPublicEnv(locals, 'HD_IMAGE_URL'));
}

export function getMoodHdImageOrigin(locals?: any): string {
  const hdImageUrl = getMoodHdImageBase(locals);
  if (!hdImageUrl) return '';

  try {
    return new URL(hdImageUrl).origin.toLowerCase();
  } catch {
    return '';
  }
}

export function toMoodAvatarUrl(avatar: string, locals?: any): string {
  if (!avatar) return '';
  if (avatar.startsWith('/static/')) return avatar;

  const normalized = normalizeMoodImageUrl(avatar.startsWith('http') ? avatar : `https:${avatar}`);
  const hdImageOrigin = getMoodHdImageOrigin(locals);

  if (hdImageOrigin) {
    try {
      if (new URL(normalized).origin.toLowerCase() === hdImageOrigin) {
        return normalized;
      }
    } catch {
      // Fall through to static proxy fallback.
    }
  }

  return `/static/${normalized}`;
}

export function loadMoodCommentsFixture(postId: string): MoodCommentsPage {
  return createE2EComments(postId) as MoodCommentsPage;
}
