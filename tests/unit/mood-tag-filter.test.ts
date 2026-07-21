import { describe, expect, test } from 'bun:test';

import {
  getMoodTagHref,
  isMoodTagSlug,
  normalizeMoodTagSlug,
} from '../../src/features/mood/shared/tag-filter';

describe('isMoodTagSlug', () => {
  test('accepts lowercase alphanumeric and underscore slugs', () => {
    expect(isMoodTagSlug('life')).toBe(true);
    expect(isMoodTagSlug('mood_2026')).toBe(true);
    expect(isMoodTagSlug('a')).toBe(true);
    expect(isMoodTagSlug('a'.repeat(64))).toBe(true);
  });

  test('rejects uppercase, symbols, empty, and oversized values', () => {
    expect(isMoodTagSlug('')).toBe(false);
    expect(isMoodTagSlug('Life')).toBe(false);
    expect(isMoodTagSlug('#life')).toBe(false);
    expect(isMoodTagSlug('li fe')).toBe(false);
    expect(isMoodTagSlug('life-2026')).toBe(false);
    expect(isMoodTagSlug('a'.repeat(65))).toBe(false);
  });
});

describe('normalizeMoodTagSlug', () => {
  test('trims, strips a leading hash, and lowercases', () => {
    expect(normalizeMoodTagSlug(' #Life ')).toBe('life');
    expect(normalizeMoodTagSlug('#MOOD_2026')).toBe('mood_2026');
    expect(normalizeMoodTagSlug('life')).toBe('life');
  });

  test('returns empty string for hostile or invalid input', () => {
    expect(normalizeMoodTagSlug('')).toBe('');
    expect(normalizeMoodTagSlug(null)).toBe('');
    expect(normalizeMoodTagSlug(undefined)).toBe('');
    expect(normalizeMoodTagSlug('##double')).toBe('');
    expect(normalizeMoodTagSlug('<script>alert(1)</script>')).toBe('');
    expect(normalizeMoodTagSlug('tag with spaces')).toBe('');
    expect(normalizeMoodTagSlug('../../etc/passwd')).toBe('');
    expect(normalizeMoodTagSlug('a'.repeat(65))).toBe('');
  });
});

describe('getMoodTagHref', () => {
  test('builds the tag filter URL for valid tags', () => {
    expect(getMoodTagHref('life')).toBe('/mood?tag=life');
    expect(getMoodTagHref('#Life')).toBe('/mood?tag=life');
  });

  test('falls back to the plain feed for invalid tags', () => {
    expect(getMoodTagHref('')).toBe('/mood');
    expect(getMoodTagHref('bad tag!')).toBe('/mood');
  });
});
