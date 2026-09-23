import { describe, expect, test } from 'bun:test';

import { parseOwnCommentIds, withOwnCommentId } from '../../src/features/mood/shared/own-comments';

describe('parseOwnCommentIds', () => {
  test('returns an empty array for null, empty, or malformed input', () => {
    expect(parseOwnCommentIds(null)).toEqual([]);
    expect(parseOwnCommentIds('')).toEqual([]);
    expect(parseOwnCommentIds('not json')).toEqual([]);
    expect(parseOwnCommentIds('{"not":"an array"}')).toEqual([]);
  });

  test('drops non-string entries rather than throwing', () => {
    expect(parseOwnCommentIds('["a", 1, null, "b"]')).toEqual(['a', 'b']);
  });

  test('parses a plain array of ids', () => {
    expect(parseOwnCommentIds('["a", "b"]')).toEqual(['a', 'b']);
  });
});

describe('withOwnCommentId', () => {
  test('appends a new id', () => {
    expect(withOwnCommentId(['a'], 'b')).toEqual(['a', 'b']);
  });

  test('de-duplicates and moves the id to the end', () => {
    expect(withOwnCommentId(['a', 'b', 'c'], 'a')).toEqual(['b', 'c', 'a']);
  });

  test('ignores an empty id', () => {
    expect(withOwnCommentId(['a'], '')).toEqual(['a']);
  });

  test('caps the list to the most recent 200 ids', () => {
    const ids = Array.from({ length: 200 }, (_, i) => `id-${i}`);
    const result = withOwnCommentId(ids, 'newest');
    expect(result.length).toBe(200);
    expect(result[0]).toBe('id-1');
    expect(result[result.length - 1]).toBe('newest');
  });
});
