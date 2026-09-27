// Source assertions, kept on purpose: the rule is a 45 s timer interplaying
// with visibilitychange, the detail-page e2e has no clock control to drive
// it, and there is no jsdom harness here. The regression this locks is a real
// one, seen on the page -- a thread that first rendered empty kept "No
// comments here yet..." on screen after the tick brought in a Telegram-origin
// comment, because only the initial-load and own-insert paths cleared the note.

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
  test('live refresh clears the empty note on the first new comment', () => {
    expect(bodyOf('async function refreshLiveComments')).toContain('addComments(comments, true)');
    // Every path that adds comments to the thread clears the note.
    for (const signature of [
      'async function refreshLiveComments',
      'export function insertGhostComment',
    ]) {
      expect(bodyOf(signature)).toContain('emptyEl.hidden = true');
    }
  });

  test('live refresh pauses while the tab is hidden', () => {
    const body = bodyOf('async function refreshLiveComments');

    expect(body).toContain("document.visibilityState !== 'visible'");
    expect(body).toContain('MIN_REFRESH_GAP_MS');
  });
});
