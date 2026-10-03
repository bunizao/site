import { describe, expect, test } from 'bun:test';

import { readYear, type ContributionDay } from '@/features/desk/client/year';

// Consecutive days from 2026-09-27, a Sunday.
const year = (...counts: number[]): ContributionDay[] =>
  counts.map((count, i) => ({
    date: new Date(Date.UTC(2026, 8, 27 + i)).toISOString().slice(0, 10),
    count,
    level: count > 0 ? 1 : 0,
  }));

describe('readYear', () => {
  test('adds the year up', () => {
    const reading = readYear(year(3, 0, 5, 9, 1, 0, 2));
    expect(reading?.total).toBe(20);
    expect(reading?.longest).toBe(3);
    expect(reading?.busiest.count).toBe(9);
    expect(reading?.busiest.date).toBe('2026-09-30');
    // Wednesday carries the 9.
    expect(reading?.weekday).toBe(3);
  });

  test('counts the run going now up to the latest day', () => {
    expect(readYear(year(0, 1, 1, 1))?.current).toBe(3);
    expect(readYear(year(1, 0, 1))?.current).toBe(1);
  });

  test('leaves an empty today out of the run, but not an empty yesterday', () => {
    expect(readYear(year(1, 1, 0))?.current).toBe(2);
    expect(readYear(year(1, 1, 0, 0))?.current).toBe(0);
  });

  test('says nothing about an empty year', () => {
    expect(readYear([])).toBeNull();
  });
});
