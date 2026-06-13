import type { ChannelInfo, Post } from '@/features/mood/server/telegram-source';
import { getChannelInfo } from '@/features/mood/server/telegram-source';
import { getRelatedLinks, getTextPreviewHtml, getTextPreviewWithMedia } from '@/features/mood/shared/utils';
import type {
  NotifyChannelMeta,
  NotifyEmailRelatedLink,
  NotifyMoodEmailContent,
  NotifyMoodPost,
  NotifyMoodSource,
} from '@/features/notify/server/mood-source';
import type { NotifyRequestContext } from '@/features/notify/server/service';

const MAX_DIGEST_FETCH_POSTS = 180;
const MAX_DIGEST_FETCH_PAGES = 12;

function getSiteUrl(context: NotifyRequestContext): string {
  return new URL(context.request.url).origin;
}

function getPostTimestamp(post: NotifyMoodPost): number {
  const parsed = Date.parse(post.datetime);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isTextPost(post: Post | undefined): post is Post {
  return Boolean(post?.id && post.type === 'text');
}

async function loadChannelInfo(
  context: NotifyRequestContext,
  options: Record<string, unknown>
): Promise<ChannelInfo | Post> {
  return getChannelInfo(
    {
      request: context.request,
      locals: context.locals,
    } as any,
    options as any
  ) as Promise<ChannelInfo | Post>;
}

export function createTelegramMoodSource(): NotifyMoodSource {
  return {
    async loadPost(context, postId) {
      try {
        const result = await loadChannelInfo(context, {
          type: 'single',
          id: postId,
          skipCache: true,
        }) as Post;

        return isTextPost(result) ? result : null;
      } catch (error) {
        console.error('Notify failed to load mood post:', error);
        return null;
      }
    },

    async loadLatestPost(context) {
      try {
        const result = await loadChannelInfo(context, {
          type: 'list',
          skipCache: true,
        }) as ChannelInfo;

        const posts = (result?.posts ?? [])
          .filter(isTextPost)
          .sort((a, b) => Number.parseInt(b.id, 10) - Number.parseInt(a.id, 10));

        return posts[0] ?? null;
      } catch (error) {
        console.error('Notify failed to load latest mood post:', error);
        return null;
      }
    },

    async loadPostsInWindow(context, input) {
      const sinceMs = input.since.getTime();
      const untilMs = input.until.getTime();
      if (!Number.isFinite(sinceMs) || !Number.isFinite(untilMs) || sinceMs >= untilMs) {
        return [];
      }

      const collected: NotifyMoodPost[] = [];
      const seenIds = new Set<string>();
      let before = '';
      let pageCount = 0;
      let reachedWindowStart = false;

      while (
        pageCount < MAX_DIGEST_FETCH_PAGES
        && collected.length < MAX_DIGEST_FETCH_POSTS
      ) {
        pageCount += 1;

        let result: ChannelInfo;
        try {
          result = await loadChannelInfo(context, {
            type: 'list',
            before,
            skipCache: true,
          }) as ChannelInfo;
        } catch (error) {
          console.error('Notify failed to load mood list for digest:', error);
          break;
        }

        const pagePosts = (result?.posts ?? [])
          .filter(isTextPost)
          .sort((a, b) => Number.parseInt(b.id, 10) - Number.parseInt(a.id, 10));

        if (!pagePosts.length) {
          break;
        }

        for (const post of pagePosts) {
          if (seenIds.has(post.id)) {
            continue;
          }
          seenIds.add(post.id);

          const timestamp = getPostTimestamp(post);
          if (!timestamp) {
            continue;
          }

          if (timestamp <= sinceMs) {
            reachedWindowStart = true;
            break;
          }

          if (timestamp > untilMs) {
            continue;
          }

          collected.push(post);
          if (collected.length >= MAX_DIGEST_FETCH_POSTS) {
            break;
          }
        }

        const nextBefore = pagePosts[pagePosts.length - 1]?.id?.trim() || '';
        if (!nextBefore || nextBefore === before || reachedWindowStart) {
          break;
        }
        before = nextBefore;
      }

      return collected.sort((a, b) => getPostTimestamp(b) - getPostTimestamp(a));
    },

    async loadChannelMeta(context): Promise<NotifyChannelMeta | null> {
      try {
        const result = await loadChannelInfo(context, {
          type: 'list',
        }) as ChannelInfo;

        if (!result || !('posts' in result)) {
          return null;
        }

        const title = (result.title || '').trim() || undefined;
        const avatarUrl = (result.avatar || '').trim() || undefined;

        return { title, avatarUrl };
      } catch (error) {
        console.error('Notify failed to load channel metadata:', error);
        return null;
      }
    },

    renderPostForEmail(context, post, options): NotifyMoodEmailContent {
      const moodPost = post as Post;
      return {
        previewText: getTextPreviewWithMedia(moodPost),
        previewHtml: getTextPreviewHtml(moodPost, { preserveBookmarks: true }),
        relatedLinks: getRelatedLinks(moodPost, {
          baseUrl: getSiteUrl(context),
          maxCount: options.relatedLinkMaxCount,
          excludeInlineAnchors: true,
          excludeInternalLinks: true,
        }) as NotifyEmailRelatedLink[],
      };
    },
  };
}
