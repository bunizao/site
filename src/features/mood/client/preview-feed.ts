/**
 * Posts requested by every home preview. The home mood section and the hero
 * card both ask for this many (the card keeps fewer), so they share one URL
 * and therefore one edge cache entry and one in-page request.
 */
export const HOME_MOOD_PREVIEW_LIMIT = 5;

/**
 * Endpoints for small "latest moods" previews (home page cards), in order of
 * preference. The D1 archive route is cached inside site-api and at the CDN;
 * the live t.me mirror is only a fallback because every cache miss scrapes and
 * parses the whole channel page.
 */
export function buildMoodPreviewFeedUrls(limit: number): string[] {
  const query = new URLSearchParams({ limit: String(limit) });
  return [`/api/v2/mood?${query}`, '/api/moods'];
}

/**
 * Fetch the newest mood posts for a preview. Reads the archive first and
 * retries once against the live mirror when the archive fails, matching the
 * /mood feed controller's fallback order.
 */
export async function fetchMoodPreviewPosts<T = unknown>(
  limit: number,
  fetchImpl: (url: string) => Promise<Response> = (url) => fetch(url),
): Promise<T[]> {
  let lastError: unknown = null;

  for (const url of buildMoodPreviewFeedUrls(limit)) {
    try {
      const response = await fetchImpl(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch moods (${response.status}).`);
      }
      const data = await response.json() as { posts?: unknown };
      return Array.isArray(data.posts) ? (data.posts.slice(0, limit) as T[]) : [];
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error('Failed to fetch moods.');
}

const sharedPreviewRequests = new Map<number, Promise<unknown[]>>();

/**
 * Like `fetchMoodPreviewPosts`, but every caller on the page asking for the
 * same limit shares one request. A failed request is forgotten so the next
 * caller can retry. Each caller gets its own copy of the list.
 */
export function getSharedMoodPreviewPosts<T = unknown>(
  limit: number = HOME_MOOD_PREVIEW_LIMIT,
  fetchImpl?: (url: string) => Promise<Response>,
): Promise<T[]> {
  let request = sharedPreviewRequests.get(limit);
  if (!request) {
    request = fetchMoodPreviewPosts(limit, fetchImpl);
    sharedPreviewRequests.set(limit, request);
    request.catch(() => {
      if (sharedPreviewRequests.get(limit) === request) sharedPreviewRequests.delete(limit);
    });
  }
  return request.then((posts) => posts.slice() as T[]);
}

/** Test hook: forget shared requests between cases. */
export function resetSharedMoodPreviewPosts(): void {
  sharedPreviewRequests.clear();
}
