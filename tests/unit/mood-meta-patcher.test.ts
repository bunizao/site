import { afterAll, afterEach, beforeAll, describe, expect, setSystemTime, test } from 'bun:test';

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
  afterEach(() => {
    setSystemTime();
  });

  test('a failed batch is not requested again for 30 seconds', async () => {
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

    setSystemTime(new Date('2026-09-26T00:00:00Z'));
    await patcher.patchVisible();
    await patcher.patchVisible();
    expect(calls).toEqual([['3196']]);

    setSystemTime(new Date('2026-09-26T00:00:31Z'));
    await patcher.patchVisible();
    expect(calls).toEqual([['3196'], ['3196']]);
  });

  test('callers queued behind a request do not fetch the same ids twice', async () => {
    const { createMoodMetaPatcher } = await importPatcher();
    const root = createRoot([createMoodElement('1'), createMoodElement('2')]);

    const calls: string[][] = [];
    const releases: Array<() => void> = [];
    const patcher = createMoodMetaPatcher({
      root,
      readSource: 'archive',
      fetchCounts: (ids) => {
        calls.push([...ids]);
        return new Promise((resolve) => {
          releases.push(() => resolve({}));
        });
      },
    });

    // Both queued callers wake together when the first request lands; the
    // first to start marks '2' in flight, so the second finds nothing to do.
    const first = patcher.patch(['1']);
    const queued = [patcher.patch(['2']), patcher.patch(['2'])];
    releases[0]();
    await first;
    await Promise.resolve();
    releases.forEach((release) => release());
    await Promise.all(queued);

    expect(calls).toEqual([['1'], ['2']]);
  });

  test('does not refetch ids already patched', async () => {
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
