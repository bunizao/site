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

  test('tallies every month from the first January to now, oldest first', () => {
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
    // 2024 and 2025 in full, then January to April 2026.
    expect(ledger.months).toHaveLength(12 + 12 + 4);
    expect(ledger.months[0]).toMatchObject({ year: 2024, month: 1, posts: 0, height: 0 });
    expect(ledger.months.at(-1)).toMatchObject({ year: 2026, month: 4 });

    const march = ledger.months[2];
    expect(march).toMatchObject({ year: 2024, month: 3, posts: 2, words: 5 });
    // Against the busiest month (16 words), on a square root.
    expect(march.height).toBeCloseTo(Math.sqrt(5 / 16));
    expect(ledger.months[24]).toMatchObject({ year: 2026, month: 1, height: 1 });
  });

  test('is null with nothing written', () => {
    expect(writingLedger([])).toBeNull();
  });
});

describe('formatWords', () => {
  test('writes 万 in Chinese and grouped digits in English', () => {
    expect(formatWords(86_240, 'zh')).toBe('8.6 万字');
    expect(formatWords(120_000, 'zh')).toBe('12 万字');
    expect(formatWords(9_999, 'zh')).toBe('9,999 字');
    expect(formatWords(86_240, 'en')).toBe('86,240 words');
    expect(formatWords(1, 'en')).toBe('1 word');
  });
});
