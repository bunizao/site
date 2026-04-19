import { describe, expect, test } from 'bun:test';

import { formatRelativeCommentDate } from '../../src/features/mood/shared/comments';

describe('formatRelativeCommentDate', () => {
  test('returns an empty string for invalid timestamps', () => {
    expect(formatRelativeCommentDate('')).toBe('');
    expect(formatRelativeCommentDate('not-a-date')).toBe('');
  });
});
