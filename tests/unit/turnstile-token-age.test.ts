// The rule behind an "INPUT 400" (now "BOT 400") on a real submission: a
// token warmed when the thread scrolled into view, then spent minutes later
// on a phone whose tab had slept through the widget's own expiry timer.
// Cloudflare refuses it as invalid_token and the comment never lands.

import { describe, expect, test } from 'bun:test';
import { isTokenStale } from '../../src/features/comments/client/turnstile-token';

const SOLVED_AT = 1_000_000;

describe('isTokenStale', () => {
  test('a token solved a moment ago is good', () => {
    expect(isTokenStale({ settled: true, solvedAt: SOLVED_AT }, SOLVED_AT + 1_000)).toBe(false);
  });

  test('a token still inside the window is good', () => {
    expect(isTokenStale({ settled: true, solvedAt: SOLVED_AT }, SOLVED_AT + 239_000)).toBe(false);
  });

  test('a token past the window is stale', () => {
    expect(isTokenStale({ settled: true, solvedAt: SOLVED_AT }, SOLVED_AT + 241_000)).toBe(true);
  });

  // The phone-slept-through-it case. Cloudflare's own expiry is ~300s, so the
  // window has to close first or the check buys nothing.
  test('the window closes before Cloudflare expires the token at ~300s', () => {
    expect(isTokenStale({ settled: true, solvedAt: SOLVED_AT }, SOLVED_AT + 300_000)).toBe(true);
  });

  // A solve in flight is not old, it is unfinished -- discarding its promise
  // would abandon a request that is about to resolve.
  test('an unsettled token is never stale, however long it has been waiting', () => {
    expect(isTokenStale({ settled: false, solvedAt: 0 }, SOLVED_AT + 10_000_000)).toBe(false);
  });
});
