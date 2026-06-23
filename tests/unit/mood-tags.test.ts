import { describe, expect, test } from 'bun:test';
import { getMoodTagHref, normalizeMoodTag } from '../../src/features/mood/shared/tags';

describe('mood tag helpers', () => {
  test('normalizes query and post tag values', () => {
    expect(normalizeMoodTag('#Claude')).toBe('claude');
    expect(normalizeMoodTag('  ##Travel  ')).toBe('travel');
    expect(normalizeMoodTag('')).toBe('');
  });

  test('builds encoded mood tag filter links', () => {
    expect(getMoodTagHref('Claude')).toBe('/mood?tag=claude');
    expect(getMoodTagHref('#ai tools')).toBe('/mood?tag=ai%20tools');
    expect(getMoodTagHref('')).toBe('/mood');
  });
});
