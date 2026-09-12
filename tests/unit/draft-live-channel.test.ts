// draft-live-channel.ts is DOM-driven (window.postMessage, .blog-prose swap)
// and this repo's unit tests run under bun with no DOM. Its pure parts —
// message validation and the in-flight coalescer — are split out precisely
// so they can be unit tested without one; the DOM-touching wiring is left to
// the Playwright preview-channel test the plan calls for.

import { describe, expect, test } from 'bun:test';

import {
  createCoalescedRunner,
  isTrustedParentOrigin,
  parseDraftMessage,
} from '../../src/features/posts/client/draft-live-channel';

describe('parseDraftMessage', () => {
  test('accepts a well-formed buxx:draft message', () => {
    expect(parseDraftMessage({ type: 'buxx:draft', html: '<p>hi</p>' })).toEqual({
      type: 'buxx:draft',
      html: '<p>hi</p>',
    });
  });

  test('rejects anything else, silently', () => {
    const cases: unknown[] = [
      null,
      undefined,
      'buxx:draft',
      42,
      {},
      { type: 'buxx:draft' },
      { type: 'buxx:draft', html: 42 },
      { type: 'other', html: '<p>hi</p>' },
      { type: 'mood-embed-resize', height: 200 },
    ];

    for (const value of cases) {
      expect(parseDraftMessage(value)).toBeNull();
    }
  });
});

describe('isTrustedParentOrigin', () => {
  test('accepts only an exact match against the configured origin', () => {
    expect(isTrustedParentOrigin('https://blog.buxx.me', 'https://blog.buxx.me')).toBe(true);
  });

  test('rejects everything when no origin is configured', () => {
    expect(isTrustedParentOrigin('https://blog.buxx.me', null)).toBe(false);
    expect(isTrustedParentOrigin('https://blog.buxx.me', '')).toBe(false);
  });

  test('rejects a mismatched or spoofed origin', () => {
    expect(isTrustedParentOrigin('https://evil.example', 'https://blog.buxx.me')).toBe(false);
    // A trailing slash, different scheme, or different port is a different origin.
    expect(isTrustedParentOrigin('https://blog.buxx.me/', 'https://blog.buxx.me')).toBe(false);
    expect(isTrustedParentOrigin('http://blog.buxx.me', 'https://blog.buxx.me')).toBe(false);
  });
});

// Flushes every pending microtask (unlike a bare `await Promise.resolve()`,
// which only advances one tick — not enough to cross the catch().finally()
// chain createCoalescedRunner builds on each call).
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('createCoalescedRunner', () => {
  test('runs a single call immediately', async () => {
    const calls: string[] = [];
    const run = createCoalescedRunner(async (value: string) => {
      calls.push(value);
    });

    run('a');
    await flush();
    expect(calls).toEqual(['a']);
  });

  test('only the latest queued value runs — a burst of three runs at most twice', async () => {
    const calls: string[] = [];
    const gates: Array<() => void> = [];
    const run = createCoalescedRunner(async (value: string) => {
      calls.push(value);
      await new Promise<void>((resolve) => gates.push(resolve));
    });

    run('a');
    run('b');
    run('c');
    await flush();
    expect(calls).toEqual(['a']); // 'b' was overwritten by 'c' while 'a' was in flight

    gates[0]?.();
    await flush();
    expect(calls).toEqual(['a', 'c']);

    gates[1]?.();
    await flush();
    expect(calls).toEqual(['a', 'c']); // nothing left queued — no third run
  });

  test('a rejected run does not wedge the queue', async () => {
    const calls: string[] = [];
    const run = createCoalescedRunner(async (value: string) => {
      calls.push(value);
      if (value === 'a') throw new Error('render failed');
    });

    run('a');
    await flush();
    run('b');
    await flush();

    expect(calls).toEqual(['a', 'b']);
  });
});
