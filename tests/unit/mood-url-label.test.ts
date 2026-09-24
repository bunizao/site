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

  test('returns an unparsable value unchanged', () => {
    expect(formatUrlLabel('not a url')).toBe('not a url');
  });
});
