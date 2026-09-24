import { describe, expect, test } from 'bun:test';

import { countWords, formatWords, writingLedger } from '@/features/posts/ledger';

describe('countWords', () => {
  test('counts each CJK character and each Latin word once', () => {
    expect(countWords('生长于共鸣')).toBe(5);
    expect(countWords("It's a quiet sea.")).toBe(4);
    expect(countWords('用 Astro 写了 3 篇 blog posts')).toBe(4 + 1 + 1 + 2);
    expect(countWords('  ')).toBe(0);
  });
});

describe('writingLedger', () => {
  const post = (publishedAt: string, plaintext: string) => ({ publishedAt, plaintext });

  test('tallies months from the first year to now, newest first', () => {
    const ledger = writingLedger(
      [
        post('2024-03-05T10:00:00Z', 'one two three four'),
        post('2024-03-20T10:00:00Z', 'one'),
        post('2026-01-02T10:00:00Z', '一二三四五六七八九十一二三四五六'),
      ],
      new Date('2026-04-10T00:00:00Z'),
    )!;

    expect(ledger.posts).toBe(3);
    expect(ledger.words).toBe(21);
    expect(ledger.since).toBe(2024);
    expect(ledger.years.map((year) => year.year)).toEqual([2026, 2025, 2024]);

    const march = ledger.years[2].months[2];
    expect(march).toMatchObject({ month: 3, posts: 2, words: 5, ahead: false });
    // Against the busiest month (16 words), on a square root.
    expect(march.level).toBe(3);
    expect(ledger.years[0].months[0].level).toBe(4);
    expect(ledger.years[1].months.every((month) => month.level === 0)).toBe(true);
    expect(ledger.years[0].months[3].ahead).toBe(false);
    expect(ledger.years[0].months[4].ahead).toBe(true);
  });

  test('is null with nothing written', () => {
    expect(writingLedger([])).toBeNull();
  });
});

describe('formatWords', () => {
  test('writes 万 in Chinese and grouped digits in English', () => {
    expect(formatWords(86_240, 'zh')).toBe('8.6 万');
    expect(formatWords(120_000, 'zh')).toBe('12 万');
    expect(formatWords(9_999, 'zh')).toBe('9,999');
    expect(formatWords(86_240, 'en')).toBe('86,240');
  });
});
