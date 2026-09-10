// The floating back-to-top on /mood/[id] is fixed to the bottom-right corner.
// On a phone the comment thread is a full-bleed column that reaches the same
// corner, so the control used to sit on the thread's own right-edge controls --
// the compose box's 32px send button landed entirely underneath it. There is
// no horizontal room to dodge into at that width, so the control steps aside
// while the thread is on screen. Source assertions, the same way the repo
// covers its other client scripts (see mood-comment-source.test.ts).

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../../src/features/mood/ui/BackToTop.astro', import.meta.url),
  'utf8',
);

describe('mood back-to-top', () => {
  test('steps aside for the comment thread', () => {
    expect(source).toContain("document.querySelector('.mood-comments')");
    expect(source).toContain('blockedByComments');
    // Folded through the same class the scroll direction uses, so there is one
    // visible/hidden state rather than two fighting each other.
    expect(source).toContain("dir === 'up' && y > threshold && !blockedByComments()");
  });

  test('only at the widths where the column reaches the corner', () => {
    expect(source).toContain("window.matchMedia('(max-width: 700px)')");
    expect(source).toContain('narrow.addEventListener');
    expect(source).toContain('if (!comments || !narrow.matches) return false;');
  });

  // A hard-coded band would drift the moment the clamp() or the safe-area
  // inset changes; reading the control's own box keeps one source of truth.
  test('measures its band off the control itself', () => {
    expect(source).toContain('getComputedStyle(button).bottom');
    expect(source).toContain('button.offsetHeight');
    expect(source).not.toMatch(/bandTop\s*=\s*window\.innerHeight\s*-\s*\d+;/);
  });
});
