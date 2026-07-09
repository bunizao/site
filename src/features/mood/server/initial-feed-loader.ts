import { mergeMoodFeedWindowPosts } from '@/features/mood/shared/feed-anchor';

interface MoodFeedWindow {
  posts: Array<{ id?: string | null }>;
}

interface LoadInitialMoodFeedOptions<T extends MoodFeedWindow> {
  anchorId: string;
  focusedBefore: string;
  fallbackBefore: string;
  loadFeed: (query: { before?: string }) => Promise<T>;
}

export interface InitialMoodFeedResult<T> {
  value: T;
  usedFallback: boolean;
}

function valueFrom<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === 'fulfilled' ? result.value : null;
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
    return { value: await loadFeed({}), usedFallback: false };
  }

  const focusedLoad = focusedBefore ? loadFeed({ before: focusedBefore }) : Promise.resolve(null);
  const fallbackLoad = fallbackBefore && fallbackBefore !== focusedBefore
    ? loadFeed({ before: fallbackBefore })
    : Promise.resolve(null);
  const [focusedResult, fallbackResult] = await Promise.allSettled([focusedLoad, fallbackLoad]);
  const focused = valueFrom(focusedResult);
  const fallback = valueFrom(fallbackResult);

  if (focused?.posts.some((post) => post.id === anchorId)) {
    return { value: focused, usedFallback: false };
  }

  if (fallback?.posts.length) {
    return { value: fallback, usedFallback: true };
  }

  if (focused?.posts.length) {
    return {
      value: {
        ...focused,
        posts: mergeMoodFeedWindowPosts(focused.posts),
      },
      usedFallback: false,
    };
  }

  return { value: await loadFeed({}), usedFallback: false };
}
