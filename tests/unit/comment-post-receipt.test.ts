// What a reader sees between pressing Post and the moderation verdict.
//
// site-api gives the spam check 1.5s and finishes the request without it
// (comment-service.ts, MODERATION_DEADLINE_MS), so `held` is the ordinary
// answer to an ordinary comment -- the verdict lands seconds later in a
// `waitUntil` continuation. Two regressions came out of treating that
// ordinary answer as a verdict:
//
//   - mood answered it with a banner over the compose box saying the comment
//     had been posted somewhere only the writer could see, never inserted the
//     row, and never watched for the flip. Shown on nearly every comment, and
//     it never came down.
//   - the blog did the right thing but gave up after three probes over twelve
//     seconds, then told the row permanently that only its writer could see
//     it -- for comments that went public moments later.
//
// Source assertions, the way the repo covers its other client scripts (see
// mood-comments-live-refresh.test.ts).

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { commentsCopy, moodCommentsCopy } from '@/features/comments/copy';

const read = (path: string): string =>
  readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8');

const moodCompose = read('features/mood/client/detail-compose.ts');
const moodController = read('features/mood/client/detail-comments-controller.ts');
const moodComposeUi = read('features/mood/ui/CommentCompose.astro');
const blogController = read('features/comments/client/comments-controller.ts');
const validate = read('features/comments/compose-validate.ts');
const identityRow = read('features/comments/ui/IdentityRow.astro');

/** Every delay in a `const <NAME> = [...]` array of milliseconds. */
const pollDelays = (source: string): number[] => {
  const match = source.match(/const VERDICT_POLL_DELAYS_MS = \[([^\]]+)\]/);
  expect(match).not.toBeNull();
  return match![1].split(',').map((part) => Number(part.replace(/_/g, '').trim()));
};

describe('mood: the row is the receipt', () => {
  test('no banner over the compose box', () => {
    expect(moodComposeUi).not.toContain('data-compose-held');
    expect(moodComposeUi).not.toContain('mood-compose__held');
  });

  test('the row goes in before the request leaves', () => {
    const pressToPost = moodCompose.slice(
      moodCompose.indexOf('async function handleSubmit'),
      moodCompose.indexOf('const response = await postJson'),
    );
    expect(pressToPost).toContain('insertGhostComment(ghostKey');
    // Both of these cost seconds and neither may come first.
    expect(pressToPost.indexOf('insertGhostComment')).toBeLessThan(pressToPost.indexOf('getTurnstileToken'));
    expect(pressToPost.indexOf('insertGhostComment')).toBeLessThan(pressToPost.indexOf('mintDwellToken'));
  });

  test('the write carries the same browser evidence as the blog', () => {
    // Without it every mood comment scored `no_client` toward the email ask.
    expect(moodCompose).toContain("addEventListener('focusin', armEvidence");
    expect(moodCompose).toContain('collectClientEvidence({');
    expect(moodCompose).toContain('...(await submittedEvidence)');
  });

  test('a refused write takes the row back and returns the draft', () => {
    const refused = moodCompose.slice(
      moodCompose.indexOf('if (!response.ok) {'),
      moodCompose.indexOf('dismissTurnstileChallenge(TURNSTILE_ACTION);'),
    );
    expect(refused).toContain('dropGhostComment(ghostKey)');
    expect(refused).toContain('field!.value = field!.value.trim() ? `${text}\\n\\n${field!.value}` : text;');
    expect(refused).toContain('armReply(box, replyTarget.id');
  });

  test('held starts a poll instead of ending the story', () => {
    expect(moodCompose).toContain("if (outcome === 'held') void upgradeWhenVerdictLands(");
    // The mood thread's own read path is edge-cached, viewer-agnostic, and
    // published-only, so it can never answer "is my held row public yet".
    expect(moodCompose).toContain('/api/v2/comments?surface=mood&post=');
    expect(moodCompose).not.toContain("fetchJson<CommentListResult>('/api/comments");
  });

  test('the note says what is happening, then stops', () => {
    expect(moodCommentsCopy.en.publishing).toBe('Publishing');
    expect(moodCommentsCopy.zh.publishing).toBe('发布中');
    // Settling to published leaves nothing behind: the row is just a comment.
    const settle = moodController.slice(moodController.indexOf('export function settleOwnComment'));
    expect(settle).toContain('note?.remove()');
  });
});

describe('the verdict window', () => {
  test('both surfaces wait long enough for a late verdict', () => {
    for (const source of [blogController, moodCompose]) {
      const delays = pollDelays(source);
      const total = delays.reduce((sum, delay) => sum + delay, 0);
      // The old blog window was 12s, which a queued `waitUntil` beats.
      expect(total).toBeGreaterThan(60_000);
      // And it still has to feel prompt: most verdicts land in the first few
      // seconds, so the first probe cannot be one of the long ones.
      expect(delays[0]).toBeLessThanOrEqual(2_000);
    }
  });

  test('the blog stops polling a row the page no longer has', () => {
    const poll = blogController.slice(blogController.indexOf('async function upgradeWhenVerdictLands'));
    expect(poll).toContain('if (!article.isConnected) return;');
  });

  test('"only you can see it" is reserved for a wait that really ended', () => {
    // Reached from settlePending alone -- never from the create response.
    expect(blogController).toContain('note.textContent = t.held;');
    const submit = blogController.slice(
      blogController.indexOf('const { outcome, comment, unverifiedEmail }'),
      blogController.indexOf('function announcePosted'),
    );
    expect(submit).toContain("else if (outcome === 'held') markPending(article, Number(ghost.dataset.pendingSince));");
    expect(submit).not.toContain('t.held');
  });
});

describe('an optional email field is optional', () => {
  test('one press of Post sends', () => {
    expect(validate).not.toContain('confirmAnonymousSubmit');
    expect(validate).not.toContain('anonConfirmed');
    expect(blogController).not.toContain('confirmAnonymousSubmit');
    expect(moodCompose).not.toContain('confirmAnonymousSubmit');
  });

  test('and the three-clause pitch for filling it is gone', () => {
    expect(commentsCopy.en).not.toHaveProperty('emailRecommend');
    expect(commentsCopy.zh).not.toHaveProperty('emailRecommend');
    expect(identityRow).not.toContain('data-compose-recommend');
    expect(moodComposeUi).not.toContain('data-compose-recommend');
  });
});
