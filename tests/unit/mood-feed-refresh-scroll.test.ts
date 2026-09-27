// The mood feed's Refresh button navigates to a new URL (`?refresh=<id>`)
// rather than reloading the current one, so the browser has no history entry
// for the target and nothing of its own to restore. stashMoodScrollForRefresh
// / takeMoodScrollAfterRefresh close that gap: a scroll position written
// under the canonical (refresh-marker-stripped) URL just before leaving has
// to come back out under that same key once init() strips the marker again.

import { describe, expect, test } from 'bun:test';
import {
  moodScrollRestoreKey,
  stashMoodScrollForRefresh,
  takeMoodScrollAfterRefresh,
} from '@/features/mood/client/feed-update-watcher';

/** A tiny in-memory Storage stand-in -- real sessionStorage does not exist
    in this test runtime, and the functions under test accept one instead of
    reaching for the global. */
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    removeItem: (key: string) => { map.delete(key); },
    clear: () => map.clear(),
    key: () => null,
    get length() { return map.size; },
  } as Storage;
}

describe('mood feed refresh scroll restore', () => {
  test('round-trips the scroll position under the canonical URL', () => {
    const storage = fakeStorage();
    const before = 'https://buxx.me/mood';

    stashMoodScrollForRefresh(before, 843, storage);
    // The reader lands on the refresh-marked URL init() will strip.
    const after = 'https://buxx.me/mood?refresh=1234';
    expect(takeMoodScrollAfterRefresh(after, storage)).toBe(843);
  });

  test('the write and read side agree on the key regardless of which side already stripped it', () => {
    const withMarker = 'https://buxx.me/mood?refresh=1234';
    const withoutMarker = 'https://buxx.me/mood';
    expect(moodScrollRestoreKey(withMarker)).toBe(moodScrollRestoreKey(withoutMarker));
  });

  test('preserves other query parameters in the key', () => {
    const a = moodScrollRestoreKey('https://buxx.me/mood?lang=en&refresh=1234');
    const b = moodScrollRestoreKey('https://buxx.me/mood?lang=en');
    const c = moodScrollRestoreKey('https://buxx.me/mood?lang=zh');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  test('an entry is consumed once -- a second read finds nothing', () => {
    const storage = fakeStorage();
    stashMoodScrollForRefresh('https://buxx.me/mood', 500, storage);

    expect(takeMoodScrollAfterRefresh('https://buxx.me/mood?refresh=1', storage)).toBe(500);
    expect(takeMoodScrollAfterRefresh('https://buxx.me/mood?refresh=1', storage)).toBeNull();
  });

  test('an ordinary visit with nothing stashed reads back null', () => {
    const storage = fakeStorage();
    expect(takeMoodScrollAfterRefresh('https://buxx.me/mood', storage)).toBeNull();
  });

  test('a zero or negative scroll position is not worth restoring', () => {
    const storage = fakeStorage();
    stashMoodScrollForRefresh('https://buxx.me/mood', 0, storage);
    expect(takeMoodScrollAfterRefresh('https://buxx.me/mood?refresh=1', storage)).toBeNull();
  });

  test('storage denial (private browsing) fails soundlessly on both sides', () => {
    const denied: Storage = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); },
      clear: () => {},
      key: () => null,
      length: 0,
    };

    expect(() => stashMoodScrollForRefresh('https://buxx.me/mood', 500, denied)).not.toThrow();
    expect(takeMoodScrollAfterRefresh('https://buxx.me/mood', denied)).toBeNull();
  });
});
