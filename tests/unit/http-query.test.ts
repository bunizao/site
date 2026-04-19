import { describe, expect, test } from 'bun:test';

import {
  isValidCursor,
  readBooleanFlag,
  readCursorQuery,
  readEnumQuery,
  readIntQuery,
} from '../../src/lib/http/query';

describe('query helpers', () => {
  test('reads and validates cursor query values', () => {
    const url = new URL('https://example.com/api/moods?before=12345');

    expect(readCursorQuery(url, 'before')).toBe('12345');
    expect(isValidCursor('')).toBe(true);
    expect(isValidCursor('12345678901234567890')).toBe(true);
    expect(isValidCursor('123456789012345678901')).toBe(false);
    expect(isValidCursor('abc')).toBe(false);
  });

  test('parses strict integer query values', () => {
    const url = new URL('https://example.com/api/oembed.json?count=8&maxwidth=abc&negative=-4');

    expect(readIntQuery(url, 'count')).toBe(8);
    expect(readIntQuery(url, 'negative')).toBe(-4);
    expect(readIntQuery(url, 'maxwidth')).toBeNull();
    expect(readIntQuery(url, 'missing')).toBeNull();
  });

  test('parses enums and boolean flags with sane defaults', () => {
    const url = new URL('https://example.com/api/oembed.json?density=compact&frame=false&link=1');

    expect(readEnumQuery(url, 'density', ['regular', 'compact'] as const, 'regular')).toBe('compact');
    expect(readEnumQuery(url, 'font', ['mono', 'system'] as const, 'mono')).toBe('mono');
    expect(readBooleanFlag(url, 'frame', true)).toBe(false);
    expect(readBooleanFlag(url, 'link')).toBe(true);
    expect(readBooleanFlag(url, 'missing', true)).toBe(true);
  });
});
