import { describe, expect, test } from 'bun:test';

import { looksLikeCommentMarkdown } from '@/features/comments/client/markdown-preview';

describe('looksLikeCommentMarkdown', () => {
  test('leaves ordinary prose and arithmetic alone', () => {
    for (const source of ['', 'Nice post.', '3 * 4 = 12', 'a_b is an identifier']) {
      expect(looksLikeCommentMarkdown(source)).toBe(false);
    }
  });

  test('recognizes every supported inline form', () => {
    for (const source of [
      '**bold**',
      'This is *emphasis*.',
      'Call `render()`.',
      '[Docs](https://buxx.me/docs)',
      'See https://buxx.me/docs',
    ]) {
      expect(looksLikeCommentMarkdown(source)).toBe(true);
    }
  });

  test('recognizes every supported block form', () => {
    for (const source of ['> quote', '- one\n- two', '1. one\n2. two', '```\ncode\n```']) {
      expect(looksLikeCommentMarkdown(source)).toBe(true);
    }
  });

  test('does not advertise unsupported GFM forms', () => {
    for (const source of ['# Heading', '~~strike~~', '| a | b |\n| - | - |']) {
      expect(looksLikeCommentMarkdown(source)).toBe(false);
    }
  });
});
