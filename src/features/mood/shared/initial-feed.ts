import type { MoodFeedItem } from '@bunizao/contracts/mood';
import {
  findTooBigVideoMedia,
  hasStructuredMoodFeedMedia,
} from '@/features/mood/shared/feed-media';
import { moodFeedPostHasId } from '@/features/mood/shared/feed-anchor';

export const CRITICAL_INITIAL_POST_LIMIT = 8;

export function hasRenderableMoodFeedMedia(post: MoodFeedItem): boolean {
  const tooBigVideoMedia = findTooBigVideoMedia(post.media);
  return Boolean(
    hasStructuredMoodFeedMedia(tooBigVideoMedia ? post.media.filter((item) => item !== tooBigVideoMedia) : post.media)
    || tooBigVideoMedia
    || post.mediaHtml.trim()
    || post.previewMediaType === 'too-big-video'
    || post.image
    || (post.gallery?.items.length ?? 0) > 1
  );
}

export function getCriticalInitialPosts(
  posts: MoodFeedItem[],
  requiredPostId = '',
  baseLimit = CRITICAL_INITIAL_POST_LIMIT
): MoodFeedItem[] {
  const source = posts.filter((post) => post?.id);
  const firstMediaIndex = source.findIndex(hasRenderableMoodFeedMedia);
  const mediaLimit = firstMediaIndex >= 0 ? firstMediaIndex + 1 : 0;
  const requiredIndex = requiredPostId
    ? source.findIndex((post) => moodFeedPostHasId(post, requiredPostId))
    : -1;
  const requiredLimit = requiredIndex >= 0 ? requiredIndex + 1 : 0;
  const limit = Math.max(baseLimit, mediaLimit, requiredLimit);

  return source.slice(0, limit);
}
