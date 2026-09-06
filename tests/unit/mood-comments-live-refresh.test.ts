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
      'export function insertOwnComment',
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
