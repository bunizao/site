// The live-refresh path is DOM-driven and has no jsdom harness here, so it
// is covered the way the repo covers other client scripts: by asserting on
// the source. The regression this locks is a real one, seen on the page --
// a thread that first rendered empty kept "No comments here yet..." on
// screen after the 45 s tick brought in a Telegram-origin comment, because
// only the initial-load and own-insert paths cleared the note.

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
  // Up to the next top-level declaration.
  const end = rest.search(/\n(?:async )?function |\n(?:export )/);
  return end === -1 ? rest : rest.slice(0, end);
}

describe('mood comments live refresh', () => {
  test('clears the empty note once a tick adds a comment', () => {
    const body = bodyOf('async function refreshLiveComments');

    expect(body).toContain('addComments(comments, true)');
    expect(body).toContain('emptyEl.hidden = true');
  });

  test('every path that adds comments to the thread clears the empty note', () => {
    for (const signature of [
      'async function refreshLiveComments',
      'export function insertGhostComment',
    ]) {
      expect(bodyOf(signature)).toContain('emptyEl.hidden = true');
    }
  });

  test('stays paused while the tab is hidden', () => {
    const body = bodyOf('async function refreshLiveComments');

    expect(body).toContain("document.visibilityState !== 'visible'");
    expect(body).toContain('MIN_REFRESH_GAP_MS');
  });
});

describe('mood comments live refresh gating', () => {
  test('polls only while the thread is near the viewport and the reader is active', () => {
    const body = bodyOf('function startLiveRefresh');

    expect(body).toContain('new IntersectionObserver');
    expect(body).toContain('rootMargin: LIVE_REFRESH_ROOT_MARGIN');
    expect(body).toContain('if (!inView || isIdle()) return;');
    expect(body).toContain('lastRefreshAt = Date.now();');
    expect(source).toContain("const LIVE_REFRESH_ROOT_MARGIN = '0px 0px 400px 0px';");
    expect(source).toContain('const LIVE_REFRESH_IDLE_MS = 10 * 60_000;');
  });

  test('catches up at once when the thread comes back into view with stale data', () => {
    const body = bodyOf('function startLiveRefresh');

    expect(body).toContain('if (inView) tickIfStale();');
    expect(body).toContain('Date.now() - lastRefreshAt >= REFRESH_INTERVAL_MS');
  });
});
