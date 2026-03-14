import type { APIRequestContext } from '@playwright/test';

const E2E_FALLBACK_MOOD_ID = '990001';

interface MoodPost {
  id?: unknown;
}

interface MoodsPayload {
  posts?: MoodPost[];
}

export async function getLatestMoodId(request: APIRequestContext): Promise<string | null> {
  const response = await request.get('/api/moods?fresh=1');
  if (!response.ok()) {
    return E2E_FALLBACK_MOOD_ID;
  }

  const payload = (await response.json()) as MoodsPayload;
  const first = payload.posts?.find((post) => typeof post?.id === 'string');
  if (!first || typeof first.id !== 'string') {
    return E2E_FALLBACK_MOOD_ID;
  }

  return first.id;
}
