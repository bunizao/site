import { describe, expect, test } from 'bun:test';
import { formatUrlLabel } from '../../src/features/mood/shared/preview';

describe('formatUrlLabel', () => {
  test('drops scheme, www, query, hash and trailing slash', () => {
    expect(formatUrlLabel('https://www.example.com/notes/?ref=x#top')).toBe('example.com/notes');
  });

  test('keeps the owner of a long address and elides the rest', () => {
    expect(formatUrlLabel('https://x.com/ryolu_/status/2102933485795369213?s=46')).toBe('x.com/ryolu_/…');
  });

  test('shows a bare host alone', () => {
    expect(formatUrlLabel('https://buxx.me/')).toBe('buxx.me');
  });

  test('decodes a percent-encoded path', () => {
    expect(formatUrlLabel('https://buxx.me/blog/%E4%B8%8A%E7%BA%BF%E4%BA%86')).toBe('buxx.me/blog/上线了');
  });

  test('cuts an overlong first segment instead of keeping it whole', () => {
    expect(formatUrlLabel(`https://buxx.me/${'a'.repeat(60)}`)).toBe(`buxx.me/${'a'.repeat(24)}…`);
  });

  test('returns an unparsable value unchanged', () => {
    expect(formatUrlLabel('not a url')).toBe('not a url');
  });
});
