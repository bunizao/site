// What a reader sees between pressing Post and the moderation verdict.
//
// site-api gives the verdict 8s and finishes the request without it, so
// `held` is an ordinary answer to an ordinary comment -- the verdict lands
// seconds later in a `waitUntil` continuation, and both threads have to keep
// watching for it rather than treat `held` as the end.
//
// Source assertions for mood, the way the repo covers its other client
// scripts (see mood-comments-live-refresh.test.ts); the blog side is covered
// in e2e comments.pw.ts.

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { VERDICT_POLL_DELAYS_MS } from '@/features/comments/verdict-poll';

const read = (path: string): string =>
  readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8');

const moodCompose = read('features/mood/client/detail-compose.ts');
const moodController = read('features/mood/client/detail-comments-controller.ts');

describe('mood: the row is the receipt', () => {
  const pressToPost = moodCompose.slice(
    moodCompose.indexOf('async function handleSubmit'),
    moodCompose.indexOf('const response = await postJson'),
  );

  test('the row goes in before the Turnstile wait', () => {
    expect(pressToPost).toContain('insertGhostComment(ghostKey');
    expect(pressToPost.indexOf('insertGhostComment')).toBeLessThan(pressToPost.indexOf('getTurnstileToken'));
  });

  test('the write sends the dwell token held since load, never one minted at submit', () => {
    // A token minted as the request leaves is milliseconds old, and the
    // service silently drops a write that fast.
    expect(pressToPost).not.toContain('mintDwellToken');
  });

  test('the write carries the same browser evidence as the blog', () => {
    // Without it every mood comment scored `no_client` toward the email ask.
    expect(moodCompose).toContain("addEventListener('focusin', armEvidence");
    expect(moodCompose).toContain('collectClientEvidence({');
    expect(moodCompose).toContain('...(await submittedEvidence)');
  });

  test('held starts a poll instead of ending the story', () => {
    expect(moodCompose).toContain("if (outcome === 'held') void upgradeWhenVerdictLands(");
    // The mood thread's own read path is edge-cached, viewer-agnostic, and
    // published-only, so it can never answer "is my held row public yet".
    expect(moodCompose).toContain('/api/v2/comments?surface=mood&post=');
    expect(moodCompose).not.toContain("fetchJson<CommentListResult>('/api/comments");
  });

  test('settling to published leaves no note behind', () => {
    const settle = moodController.slice(moodController.indexOf('export function settleOwnComment'));
    expect(settle).toContain('note?.remove()');
  });
});

test('both threads wait long enough for a late verdict, and probe promptly first', () => {
  const total = VERDICT_POLL_DELAYS_MS.reduce((sum, delay) => sum + delay, 0);
  // The old blog window was 12s, which a queued `waitUntil` beats.
  expect(total).toBeGreaterThan(60_000);
  // Most verdicts land in the first few seconds, so the first probe cannot be
  // one of the long ones.
  expect(VERDICT_POLL_DELAYS_MS[0]).toBeLessThanOrEqual(2_000);
});
