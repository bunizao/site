import {
  mergeMoodFeedWindowPosts,
  moodFeedPostHasId,
} from '@/features/mood/shared/feed-anchor';

interface MoodFeedWindow {
  posts: Array<{ id?: string | null; groupIds?: string[] }>;
}

interface LoadInitialMoodFeedOptions<T extends MoodFeedWindow> {
  anchorId: string;
  focusedBefore: string;
  fallbackBefore: string;
  loadFeed: (query: { before?: string }) => Promise<T>;
}

export interface InitialMoodFeedResult<T> {
  value: T;
  cacheable: boolean;
}

async function tryLoadFeed<T extends MoodFeedWindow>(
  loadFeed: LoadInitialMoodFeedOptions<T>['loadFeed'],
  before: string,
): Promise<T | null> {
  try {
    return await loadFeed({ before });
  } catch {
    return null;
  }
}

export async function loadInitialMoodFeed<T extends MoodFeedWindow>(
  options: LoadInitialMoodFeedOptions<T>,
): Promise<InitialMoodFeedResult<T>> {
  const {
    anchorId,
    focusedBefore,
    fallbackBefore,
    loadFeed,
  } = options;

  if (!anchorId) {
    return { value: await loadFeed({}), cacheable: true };
  }

  const focused = focusedBefore ? await tryLoadFeed(loadFeed, focusedBefore) : null;

  if (focused?.posts.some((post) => moodFeedPostHasId(post, anchorId))) {
    return { value: focused, cacheable: true };
  }

  // The wide window missed the anchor (or failed) — only now is the tight
  // anchor+1 window worth its own D1 read.
  const fallback = fallbackBefore && fallbackBefore !== focusedBefore
    ? await tryLoadFeed(loadFeed, fallbackBefore)
    : null;

  if (fallback?.posts.length) {
    return { value: fallback, cacheable: false };
  }

  if (focused?.posts.length) {
    return {
      value: {
        ...focused,
        posts: mergeMoodFeedWindowPosts(focused.posts),
      },
      cacheable: false,
    };
  }

  return { value: await loadFeed({}), cacheable: false };
}
