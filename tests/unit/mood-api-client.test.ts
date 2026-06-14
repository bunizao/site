import { describe, expect, test } from 'bun:test';
import {
  loadMoodComments,
  loadMoodDocument,
  loadMoodFeed,
  loadMoodProbe,
} from '../../src/features/mood/server/api-client';

function createContext(locals: Record<string, unknown> = {}) {
  return {
    request: new Request('https://buxx.me/mood'),
    locals,
  };
}

describe('mood API client', () => {
  test('keeps explicit api-v2 mood reads independent from the private API binding', async () => {
    const context = createContext({ env: { E2E_SITE_FIXTURE: '1' } });

    const feed = await loadMoodFeed(context, { limit: 1, useApiV2: true });
    const document = await loadMoodDocument(context, feed.posts[0]?.id ?? '990001', { useApiV2: true });
    const comments = await loadMoodComments(context, feed.posts[0]?.id ?? '990001', { useApiV2: true });

    expect(feed.posts.length).toBeGreaterThan(0);
    expect(document?.id).toBe(feed.posts[0]?.id);
    expect(Array.isArray(comments.comments)).toBe(true);
  });

  test('keeps E2E fixture mode independent from the service binding', async () => {
    const probe = await loadMoodProbe(createContext({ env: { E2E_SITE_FIXTURE: '1' } }));

    expect(probe.latestId).toBeTruthy();
  });
});
