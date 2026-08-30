import { describe, expect, test } from 'bun:test';

import {
  describeCommentFailure,
  failureTag,
  readErrorSlug,
} from '../../src/features/comments/comment-error';
import { commentsCopy } from '../../src/features/comments/copy';

const zh = commentsCopy.zh.submitError;

function classify(status: number, body: unknown) {
  return describeCommentFailure(status, readErrorSlug(body), zh).code;
}

describe('readErrorSlug', () => {
  // site-api answers with two unrelated envelopes; both have to land.
  // Both fields, not the first one that happens to be set -- either half can
  // be the one carrying the slug classify() knows.
  test('reads the flat jsonError() shape', () => {
    expect(readErrorSlug({ error: 'Turnstile verification failed', code: 'turnstile_failed' }))
      .toContain('turnstile_failed');
  });

  test('reads the nested mood-family shape', () => {
    expect(readErrorSlug({ error: { code: 'invalid_parent', message: 'nope' } }))
      .toBe('invalid_parent');
  });

  test('falls back to the error string when no code is declared', () => {
    expect(readErrorSlug({ error: 'invalid_parent' })).toBe('invalid_parent');
  });

  test('survives a body that is missing, empty, or not an object', () => {
    expect(readErrorSlug(null)).toBe('');
    expect(readErrorSlug({})).toBe('');
    expect(readErrorSlug('boom')).toBe('');
  });
});

describe('describeCommentFailure', () => {
  test('separates a request that never landed from one that was refused', () => {
    expect(classify(0, null)).toBe('NET');
    expect(classify(500, null)).toBe('SERVER');
  });

  test('a rate limit outranks every other signal', () => {
    expect(classify(429, { error: 'Too Many Requests' })).toBe('RATE');
  });

  // The whole point of the split: 400 and 503 each carry more than one
  // meaning, so a slug the server volunteered has to beat its status bucket.
  test('a declared slug beats the status it arrived with', () => {
    expect(classify(400, { code: 'turnstile_failed' })).toBe('BOT');
    expect(classify(503, { code: 'turnstile_unavailable' })).toBe('BOT');
    expect(classify(400, { error: 'invalid_parent' })).toBe('THREAD');
    expect(classify(503, { code: 'comment_target_unavailable' })).toBe('GONE');
    expect(classify(400, { error: 'body must be 1-2000 characters' })).toBe('LONG');
    expect(classify(400, { error: 'dwellToken is required' })).toBe('STALE');
  });

  test('an expired claim on a comment is not a retry', () => {
    expect(classify(409, { error: 'edit_window_closed' })).toBe('CLOSED');
    expect(classify(403, { error: 'not_owner' })).toBe('CLOSED');
  });

  test('an unknown target reads as gone', () => {
    expect(classify(404, { error: 'not_found' })).toBe('GONE');
  });

  test('every code carries a message in both locales', () => {
    for (const table of [commentsCopy.zh.submitError, commentsCopy.en.submitError]) {
      for (const message of Object.values(table)) expect(message.length).toBeGreaterThan(0);
    }
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

// The bug behind an "INPUT 400" badge on a screenshot of a real submission.
// A refused Turnstile is the one branch that fills both envelope fields, and
// readErrorSlug used to return whichever it saw first.
describe('envelopes carrying both a category and a sub-reason', () => {
  test('a refused Turnstile reads as BOT, not INPUT', () => {
    const slug = readErrorSlug({ error: 'turnstile_failed', code: 'invalid_token' });
    expect(describeCommentFailure(400, slug, zh).code).toBe('BOT');
  });

  test('every turnstile sub-reason still classifies on the category', () => {
    for (const code of ['missing_token', 'invalid_token', 'hostname_mismatch', 'action_mismatch']) {
      const slug = readErrorSlug({ error: 'turnstile_failed', code });
      expect(describeCommentFailure(400, slug, zh).code).toBe('BOT');
    }
  });

  test('the sub-reason is kept, so it can still be matched on', () => {
    expect(readErrorSlug({ error: 'turnstile_failed', code: 'invalid_token' }))
      .toContain('invalid_token');
  });
});

// Two refusals that are about the identity fields, not the comment body.
describe('identity refusals', () => {
  test('a reserved or malformed display name reads as NAME', () => {
    const slug = readErrorSlug({
      error: 'displayName must be 1-32 characters and cannot use control characters or reserved names',
    });
    expect(describeCommentFailure(400, slug, zh).code).toBe('NAME');
  });

  test('a rejected email domain reads as EMAIL', () => {
    const slug = readErrorSlug({ error: 'A valid email is required' });
    expect(describeCommentFailure(400, slug, zh).code).toBe('EMAIL');
  });

  test('an unrecognised 400 is still the INPUT catch-all', () => {
    const slug = readErrorSlug({ error: 'something nobody has named yet' });
    expect(describeCommentFailure(400, slug, zh).code).toBe('INPUT');
  });
});

// site-api spends 400 on seven distinct refusals. Exactly one of them is
// about the words the reader wrote, and answering the other six with "adjust
// your wording" sent people back to edit a sentence that was never refused.
describe('the 400s, told apart', () => {
  test('over the cap is the one the reader can fix, and fix precisely', () => {
    // Both routes phrase the same refusal differently.
    for (const error of ['body must be 1-2000 characters', 'body is required (1-2000 characters)']) {
      expect(describeCommentFailure(400, readErrorSlug({ error }), zh).code).toBe('LONG');
    }
    expect(zh.LONG).toContain('2000');
  });

  test('a stale form is a refresh, not a rewrite', () => {
    const stale = [
      'dwellToken is required',      // the one in the reader's screenshot
      'postId is required',
      'parentId must be a string or null',
      'Invalid JSON body',
    ];
    for (const error of stale) {
      expect(describeCommentFailure(400, readErrorSlug({ error }), zh).code).toBe('STALE');
    }
  });

  // `displayName must be 1-32 characters` also opens with a field and a
  // length, and must not be swept up by the body rule.
  test('the identity refusals keep their own codes', () => {
    const slug = readErrorSlug({
      error: 'displayName must be 1-32 characters and cannot use control characters or reserved names',
    });
    expect(describeCommentFailure(400, slug, zh).code).toBe('NAME');
  });

  test('each 400 reads out under its own badge', () => {
    const codes = ['body must be 1-2000 characters', 'dwellToken is required', 'A valid email is required']
      .map((error) => failureTag(describeCommentFailure(400, readErrorSlug({ error }), zh)));
    expect(codes).toEqual(['LONG 400', 'STALE 400', 'EMAIL 400']);
  });
});
