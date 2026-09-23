import { describe, expect, test } from 'bun:test';

import { renderAuthorshipNoteMarkdown } from '@/features/posts/server/authorship-note';

describe('authorship note Markdown', () => {
  test('renders safe inline Markdown', () => {
    expect(renderAuthorshipNoteMarkdown(
      'Translated from **Chinese**, *reviewed* by a human, with `terms` from [the source](https://example.com).',
    )).toBe(
      'Translated from <strong>Chinese</strong>, <em>reviewed</em> by a human, with <code>terms</code> from <a href="https://example.com" rel="noopener noreferrer" target="_blank">the source</a>.',
    );
  });

  test('does not allow raw HTML or unsafe links', () => {
    expect(renderAuthorshipNoteMarkdown(
      '<img src=x onerror=alert(1)> [unsafe](javascript:alert(1)) **safe**',
    )).toBe(
      '&lt;img src=x onerror=alert(1)&gt; [unsafe](javascript:alert(1)) <strong>safe</strong>',
    );
  });
});
