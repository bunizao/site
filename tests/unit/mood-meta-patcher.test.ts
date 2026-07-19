import { beforeAll, describe, expect, test } from 'bun:test';

import { parseAbbreviatedCount } from '../../src/features/mood/server/telegram-source';

// Minimal DOM stubs: the patcher only needs innerHeight, CSS.escape, and a
// ParentNode-like root. IntersectionObserver is intentionally absent so
// observePosts() short-circuits.
beforeAll(() => {
  const globals = globalThis as Record<string, unknown>;
  globals.window ??= { innerHeight: 1000 };
  globals.document ??= {};
  globals.CSS ??= { escape: (value: string) => value };
});

interface FakeElement {
  dataset: { moodId: string };
  getBoundingClientRect(): { width: number; height: number; top: number; bottom: number };
  querySelector(): null;
  querySelectorAll(): FakeElement[];
}

function createMoodElement(id: string): FakeElement {
  return {
    dataset: { moodId: id },
    getBoundingClientRect: () => ({ width: 100, height: 100, top: 0, bottom: 100 }),
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
