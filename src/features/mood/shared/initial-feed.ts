import type { MoodFeedItem } from '@bunizao/contracts/mood';
import {
  findTooBigVideoMedia,
  hasStructuredMoodFeedMedia,
} from '@/features/mood/shared/feed-media';
import { moodFeedPostHasId } from '@/features/mood/shared/feed-anchor';

export const CRITICAL_INITIAL_POST_LIMIT = 8;

// Cards that render at most a small lazy thumbnail. A post carrying only these
// is never the LCP element, so it must not take the priority slot from a photo
// further down the feed.
const SMALL_CARD_MEDIA_TYPES = new Set(['link-preview', 'document', 'embed', 'audio', 'location', 'poll']);

function hasLargeStructuredMedia(media: MoodFeedItem['media']): boolean {
  return hasStructuredMoodFeedMedia(media.filter((item) => !SMALL_CARD_MEDIA_TYPES.has(item.type)));
}

export function hasLcpCandidateMedia(post: MoodFeedItem): boolean {
  const tooBigVideoMedia = findTooBigVideoMedia(post.media);
  return Boolean(
    hasLargeStructuredMedia(tooBigVideoMedia ? post.media.filter((item) => item !== tooBigVideoMedia) : post.media)
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
  const firstMediaIndex = source.findIndex(hasLcpCandidateMedia);
  const mediaLimit = firstMediaIndex >= 0 ? firstMediaIndex + 1 : 0;
  const requiredIndex = requiredPostId
    ? source.findIndex((post) => moodFeedPostHasId(post, requiredPostId))
    : -1;
  const requiredLimit = requiredIndex >= 0 ? requiredIndex + 1 : 0;
  const limit = Math.max(baseLimit, mediaLimit, requiredLimit);

  return source.slice(0, limit);
}
