import { describe, expect, test } from 'bun:test';

import { loadInitialMoodFeed } from '@/features/mood/server/initial-feed-loader';

function createFeed(ids: string[]) {
  return {
    posts: ids.map((id) => ({ id })),
    channel: {},
  };
}

describe('initial mood feed loader', () => {
  test('loads focused and fallback anchor windows concurrently', async () => {
    const started: string[] = [];
    const feed = await loadInitialMoodFeed({
      anchorId: '9999',
      focusedBefore: '10011',
      fallbackBefore: '10000',
      loadFeed: async ({ before }) => {
        started.push(before ?? 'latest');
        await new Promise((resolve) => setTimeout(resolve, 20));
        return before === '10011' ? createFeed(['10010']) : createFeed(['9999']);
      },
    });

    expect(started).toEqual(['10011', '10000']);
    expect(feed?.cacheable).toBe(false);
    expect(feed?.value.posts.map((post) => post.id)).toEqual(['9999']);
  });

  test('prefers the focused window when it contains the requested anchor', async () => {
    const feed = await loadInitialMoodFeed({
      anchorId: '3640',
      focusedBefore: '3651',
      fallbackBefore: '3641',
      loadFeed: async ({ before }) => before === '3651'
        ? createFeed(['3641', '3640', '3639'])
        : createFeed(['3640']),
    });

    expect(feed?.cacheable).toBe(true);
    expect(feed?.value.posts.map((post) => post.id)).toEqual(['3641', '3640', '3639']);
  });

  test('uses the latest feed only after both anchor requests fail', async () => {
    const calls: string[] = [];
    const feed = await loadInitialMoodFeed({
      anchorId: '9999',
      focusedBefore: '10011',
      fallbackBefore: '10000',
      loadFeed: async ({ before }) => {
        calls.push(before ?? 'latest');
        if (before) throw new Error('upstream unavailable');
        return createFeed(['10001']);
      },
    });

    expect(calls).toEqual(['10011', '10000', 'latest']);
    expect(feed?.cacheable).toBe(false);
    expect(feed?.value.posts.map((post) => post.id)).toEqual(['10001']);
  });

  test('keeps a focused window uncacheable when it does not contain the anchor', async () => {
    const feed = await loadInitialMoodFeed({
      anchorId: '9999',
      focusedBefore: '10011',
      fallbackBefore: '10000',
      loadFeed: async ({ before }) => before === '10011'
        ? createFeed(['10010', '10009'])
        : createFeed([]),
    });

    expect(feed.cacheable).toBe(false);
    expect(feed.value.posts.map((post) => post.id)).toEqual(['10010', '10009']);
  });
});
