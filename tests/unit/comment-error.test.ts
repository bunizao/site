import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

import {
  commentErrorDocsHref,
  describeCommentFailure,
  failureTag,
  readErrorSlug,
  type CommentErrorCode,
} from '../../src/features/comments/comment-error';
import { commentsCopy } from '../../src/features/comments/copy';

const zh = commentsCopy.zh.submitError;
const ALL_CODES = Object.keys(commentsCopy.en.submitError) as CommentErrorCode[];

function classify(status: number, body: unknown) {
  return describeCommentFailure(status, readErrorSlug(body), zh).code;
}

// [status, response body, reader code]. site-api answers with two envelopes
// (`{error, code?}` and the mood family's `{error: {code, message}}`), and 400
// and 503 each carry more than one meaning, so a declared slug has to beat
// the status bucket it arrived with.
const REFUSALS: Array<[number, unknown, CommentErrorCode]> = [
  [0, null, 'NET'],
  [500, null, 'SERVER'],
  [429, { error: 'Too Many Requests' }, 'RATE'],
  [429, { error: 'turnstile_failed' }, 'RATE'],
  [400, { code: 'turnstile_failed' }, 'BOT'],
  [503, { code: 'turnstile_unavailable' }, 'BOT'],
  [400, { error: 'Turnstile verification failed', code: 'turnstile_failed' }, 'BOT'],
  // A refused Turnstile fills both fields: `error` is the category and
  // `code` the sub-reason, and the category must win.
  [400, { error: 'turnstile_failed', code: 'missing_token' }, 'BOT'],
  [400, { error: 'turnstile_failed', code: 'invalid_token' }, 'BOT'],
  [400, { error: 'turnstile_failed', code: 'hostname_mismatch' }, 'BOT'],
  [400, { error: 'turnstile_failed', code: 'action_mismatch' }, 'BOT'],
  [400, { error: 'invalid_parent' }, 'THREAD'],
  [400, { error: { code: 'invalid_parent', message: 'nope' } }, 'THREAD'],
  [503, { code: 'comment_target_unavailable' }, 'GONE'],
  [404, { error: 'not_found' }, 'GONE'],
  [409, { error: 'edit_window_closed' }, 'CLOSED'],
  [403, { error: 'not_owner' }, 'CLOSED'],
  [403, { error: 'comments_closed' }, 'LOCKED'],
  [403, { error: 'email_verification_required' }, 'VERIFY'],
  [403, { error: 'email_required' }, 'NOMAIL'],
  [400, { error: 'displayName must be 1-32 characters and cannot use control characters or reserved names' }, 'NAME'],
  // Resend and create phrase a refused address differently.
  [400, { error: 'A valid email is required' }, 'EMAIL'],
  [400, { error: 'email must be a valid address when provided' }, 'EMAIL'],
  // Create and edit phrase the length cap differently.
  [400, { error: 'body must be 1-2000 characters' }, 'LONG'],
  [400, { error: 'body is required (1-2000 characters)' }, 'LONG'],
  [400, { error: 'dwellToken is required' }, 'STALE'],
  [400, { error: 'postId is required' }, 'STALE'],
  [400, { error: 'parentId must be a string or null' }, 'STALE'],
  [400, { error: 'Invalid JSON body' }, 'STALE'],
  [400, { error: 'something nobody has named yet' }, 'INPUT'],
  [400, null, 'INPUT'],
  [400, {}, 'INPUT'],
  [400, 'boom', 'INPUT'],
];

describe('describeCommentFailure', () => {
  test('every server refusal maps to exactly one reader code', () => {
    const got = REFUSALS.map(([status, body]) => [status, body, classify(status, body)]);
    expect(got).toEqual(REFUSALS);
  });
});

describe('failureTag', () => {
  test('carries the status when there is one', () => {
    expect(failureTag({ code: 'RATE', status: 429, message: '' })).toBe('RATE 429');
  });

  // Printing "NET 0" would invent a server response that never happened.
  test('omits a status the request never got', () => {
    expect(failureTag({ code: 'NET', status: 0, message: '' })).toBe('NET');
  });
});

// A link is a promise that there is more to say. On half these codes the
// sentence already carries the whole problem and the whole fix.
describe('commentErrorDocsHref', () => {
  test('only the refusals whose reason is invisible from the message link', () => {
    const linked = ALL_CODES.filter((code) => commentErrorDocsHref(code) !== null);
    expect(linked.sort()).toEqual(['CLOSED', 'EMAIL', 'GONE', 'NAME', 'NOMAIL', 'VERIFY']);
  });

  test('every linked refusal lands on an anchor that exists in the comments docs', () => {
    const docs = readFileSync(new URL('../../src/content/docs/surfaces/comments.md', import.meta.url), 'utf8');
    for (const code of ALL_CODES) {
      const href = commentErrorDocsHref(code);
      if (!href) continue;
      const [page, anchor] = href.split('#');
      expect(page).toBe('/docs/surfaces/comments');
      expect(docs).toContain(`id="${anchor}"`);
    }
  });
});
