import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { parseAbbreviatedCount } from '../../src/features/mood/server/telegram-source';

// Minimal DOM stubs: the patcher only needs innerHeight, CSS.escape, and a
// ParentNode-like root. IntersectionObserver is intentionally absent so
// observePosts() short-circuits. Bun runs every test file in one process, so
// anything stubbed here must be removed afterwards — a leaked `window` makes
// axios (via @tryghost/content-api) assume a browser and crash other suites.
const stubbedGlobals: string[] = [];

beforeAll(() => {
  const globals = globalThis as Record<string, unknown>;
  const stubs: Record<string, unknown> = {
    window: { innerHeight: 1000 },
    document: {},
    CSS: { escape: (value: string) => value },
  };
  for (const [key, value] of Object.entries(stubs)) {
    if (globals[key] === undefined) {
      globals[key] = value;
      stubbedGlobals.push(key);
    }
  }
});

afterAll(() => {
  const globals = globalThis as Record<string, unknown>;
  for (const key of stubbedGlobals) {
    delete globals[key];
  }
});

interface FakeElement {
  dataset: { moodId: string };
  getBoundingClientRect(): { width: number; height: number; top: number; bottom: number };
  querySelector(): null;
  querySelectorAll(): FakeElement[];
}

function createMoodElement(id: string, top = 0): FakeElement {
  return {
    dataset: { moodId: id },
    getBoundingClientRect: () => ({ width: 100, height: 100, top, bottom: top + 100 }),
    querySelector: () => null,
    querySelectorAll: () => [],
  };
}

function createRoot(elements: FakeElement[]): ParentNode {
  return {
    querySelectorAll: (selector: string) => {
      if (selector === '[data-mood-id]') return elements;
      const match = selector.match(/\[data-mood-id="([^"]+)"\]/);
      if (match) return elements.filter((el) => el.dataset.moodId === match[1]);
      return [];
    },
  } as unknown as ParentNode;
}

async function importPatcher() {
  return import('../../src/features/mood/client/meta-patcher');
}

describe('mood meta patcher live-count hydration', () => {
  test('re-attempts ids after a failed live-counts fetch', async () => {
    const { createMoodMetaPatcher } = await importPatcher();
    const root = createRoot([createMoodElement('3196')]);

    const calls: string[][] = [];
    let shouldReject = true;
    const fetchCounts = async (ids: readonly string[]) => {
      calls.push([...ids]);
      if (shouldReject) {
        shouldReject = false;
        throw new Error('network down');
      }
      return { '3196': { commentsCount: 5, reactions: null } };
    };

    const patcher = createMoodMetaPatcher({ root, readSource: 'archive', fetchCounts });

    await patcher.patchVisible();
    await patcher.patchVisible();

    expect(calls).toEqual([['3196'], ['3196']]);
  });

  test('marks ids attempted only after a successful fetch', async () => {
    const { createMoodMetaPatcher } = await importPatcher();
    const root = createRoot([createMoodElement('42')]);

    const calls: string[][] = [];
    const fetchCounts = async (ids: readonly string[]) => {
      calls.push([...ids]);
      return { '42': { commentsCount: 1, reactions: null } };
    };

    const patcher = createMoodMetaPatcher({ root, readSource: 'archive', fetchCounts });

    await patcher.patchVisible();
    await patcher.patchVisible();

    // Second pass finds no new ids because the first fetch succeeded.
    expect(calls).toEqual([['42']]);
  });

  test('does not fetch when read source is not the archive', async () => {
    const { createMoodMetaPatcher } = await importPatcher();
    const root = createRoot([createMoodElement('7')]);

    let called = false;
    const fetchCounts = async () => {
      called = true;
      return {};
    };

    const patcher = createMoodMetaPatcher({ root, readSource: 'live', fetchCounts });
    await patcher.patchVisible();

    expect(called).toBe(false);
  });

  test('patches an explicit offscreen anchor window before positioning', async () => {
    const { createMoodMetaPatcher } = await importPatcher();
    const root = createRoot([createMoodElement('3757'), createMoodElement('3758')]);
    const calls: string[][] = [];
    const patcher = createMoodMetaPatcher({
      root,
      readSource: 'archive',
      fetchCounts: async (ids) => {
        calls.push([...ids]);
        return {};
      },
    });

    await patcher.patch(['3758', '3757', '3758']);
    await patcher.patch(['3757']);

    expect(calls).toEqual([['3758', '3757']]);
  });

  test('batches far-offscreen posts after the near-viewport ones', async () => {
    const { createMoodMetaPatcher } = await importPatcher();
    // DOM order: far post first. window.innerHeight is stubbed to 1000, so
    // top 5000 is far outside the patch margin while top 0 is in view.
    const root = createRoot([createMoodElement('90', 5000), createMoodElement('91', 0)]);

    const calls: string[][] = [];
    const patcher = createMoodMetaPatcher({
      root,
      readSource: 'archive',
      fetchCounts: async (ids) => {
        calls.push([...ids]);
        return {};
      },
    });

    await patcher.patchVisible();

    // One batch, near-viewport id ordered ahead of the offscreen one.
    expect(calls).toEqual([['91', '90']]);
  });
});

describe('parseAbbreviatedCount', () => {
  test('parses plain integers', () => {
    expect(parseAbbreviatedCount('12 comments')).toBe(12);
  });

  test('parses K suffix', () => {
    expect(parseAbbreviatedCount('1.2K comments')).toBe(1200);
  });

  test('parses M suffix', () => {
    expect(parseAbbreviatedCount('3M')).toBe(3000000);
  });

  test('returns null when no number present', () => {
    expect(parseAbbreviatedCount('comments')).toBeNull();
  });
});
