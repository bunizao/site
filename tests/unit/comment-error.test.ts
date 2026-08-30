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
  test('reads the flat jsonError() shape', () => {
    expect(readErrorSlug({ error: 'Turnstile verification failed', code: 'turnstile_failed' }))
      .toBe('turnstile_failed');
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
    expect(classify(400, { error: 'Body is required' })).toBe('INPUT');
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
