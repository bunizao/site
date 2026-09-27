// Source assertions, same reason as mood-comments-live-refresh.test.ts: a
// 45s/10min timer interplaying with visibility/focus/input events has no
// jsdom harness here to drive behaviourally.
//
// The regression this locks: a reader who is still on the tab -- visible,
// focused, just not touching anything (nothing left to scroll, nothing to
// type) -- fires none of visibilitychange, focus, pointerdown, keydown,
// scroll or touchstart, because every one of those needs either a state
// transition this reader never makes or a physical input they have no
// reason to make. A hard stop on idle would then never resume on its own.

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../../src/features/mood/client/detail-comments-controller.ts', import.meta.url),
  'utf8',
);

function bodyOf(fnSignature: string): string {
  const start = source.indexOf(fnSignature);
  expect(start).toBeGreaterThan(-1);
  const rest = source.slice(start);
  const end = rest.search(/\n(?:async )?function |\n(?:export )/);
  return end === -1 ? rest : rest.slice(0, end);
}

describe('mood comments idle poll', () => {
  test('idle slows the poll instead of stopping it outright', () => {
    const body = bodyOf('function startLiveRefresh');

    // No unconditional "idle -> stop" branch left.
    expect(body).not.toContain('if (!inView || isIdle()) return;');
    // Still gated on being on screen at all.
    expect(body).toContain('if (!inView) return;');
    // Idle only holds the tick back until the slow interval has actually
    // elapsed since the last real fetch -- it does not skip forever.
    expect(body).toContain(
      'if (isIdle() && Date.now() - lastRefreshAt < LIVE_REFRESH_IDLE_INTERVAL_MS) return;',
    );
  });

  test('the slow interval sits between one ordinary tick and the idle threshold', () => {
    expect(source).toContain('const REFRESH_INTERVAL_MS = 45_000;');
    expect(source).toContain('const LIVE_REFRESH_IDLE_MS = 10 * 60_000;');
    expect(source).toContain('const LIVE_REFRESH_IDLE_INTERVAL_MS = 3 * 60_000;');

    const refresh = 45_000;
    const idleThreshold = 10 * 60_000;
    const idleInterval = 3 * 60_000;
    expect(idleInterval).toBeGreaterThan(refresh);
    expect(idleInterval).toBeLessThan(idleThreshold);
  });

  test('activity on any of visibility, focus, pointer, key or scroll still resumes at once', () => {
    const body = bodyOf('function startLiveRefresh');

    expect(body).toContain("document.addEventListener('visibilitychange'");
    expect(body).toContain("window.addEventListener('focus'");
    expect(body).toContain("['pointerdown', 'keydown', 'scroll', 'touchstart']");
    expect(body).toContain('if (wasIdle) tickIfStale();');
  });
});
