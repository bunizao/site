import { describe, expect, test } from 'bun:test';

import { dedupeNewComments } from '../../src/features/mood/shared/comments';

describe('dedupeNewComments', () => {
  test('drops a comment already loaded by id', () => {
    const result = dedupeNewComments(
      [{ id: '1' }, { id: '2' }],
      new Set(['1']),
      new Set(),
    );
    expect(result).toEqual([{ id: '2' }]);
  });

  test('drops a comment already loaded by commentId, even under a new id', () => {
    // An own comment renders first under its temporary create-response id;
    // once the bridge lands, a poll sees the same comment under the real
    // Telegram message id but the same commentId. It must not duplicate.
    const result = dedupeNewComments(
      [{ id: '4812', commentId: 'own-1' }],
      new Set(['temp-own-1']),
      new Set(['own-1']),
    );
    expect(result).toEqual([]);
  });

  test('keeps a comment whose id and commentId are both new', () => {
    const result = dedupeNewComments(
      [{ id: '5', commentId: 'c5' }],
      new Set(['1']),
      new Set(['c1']),
    );
    expect(result).toEqual([{ id: '5', commentId: 'c5' }]);
  });

  test('drops a comment with no id', () => {
    const result = dedupeNewComments([{}], new Set(), new Set());
    expect(result).toEqual([]);
  });
});
