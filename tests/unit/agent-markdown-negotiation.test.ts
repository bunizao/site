import { describe, expect, test } from 'bun:test';

import {
  estimateMarkdownTokens,
  prefersMarkdown,
} from '@/features/agent-markdown/server/negotiation';

describe('agent markdown negotiation', () => {
  test('prefers markdown only when text/markdown explicitly ranks at least as high as html', () => {
    expect(prefersMarkdown('text/markdown')).toBe(true);
    expect(prefersMarkdown('text/html')).toBe(false);
    expect(prefersMarkdown('*/*')).toBe(false);
    expect(prefersMarkdown('text/html;q=0.5, text/markdown;q=0.5')).toBe(true);
    expect(prefersMarkdown('text/html;q=0.8, text/markdown;q=0.4')).toBe(false);
    expect(prefersMarkdown('text/markdown;q=0.7, */*;q=0.8')).toBe(false);
    expect(prefersMarkdown(null)).toBe(false);
  });

  test('estimates markdown tokens from character count', () => {
    expect(estimateMarkdownTokens('')).toBe(0);
    expect(estimateMarkdownTokens('abcde')).toBe(2);
    expect(estimateMarkdownTokens('12345678')).toBe(2);
  });
});
