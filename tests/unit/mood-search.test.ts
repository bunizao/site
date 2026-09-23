import { afterEach, describe, expect, test } from 'bun:test';
import { isSafeSnippetHtml, searchMoods } from '@/features/mood/shared/search';

// These helpers use strings and fetch, so their unit contract needs no DOM.
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('isSafeSnippetHtml', () => {
  test('accepts plain text and <mark>-only markup, rejects other tags', () => {
    expect(isSafeSnippetHtml('a calm morning')).toBe(true);
    expect(isSafeSnippetHtml('a <mark>calm</mark> morning')).toBe(true);
    expect(isSafeSnippetHtml('<mark>x</mark> and <mark>y</mark>')).toBe(true);
    expect(isSafeSnippetHtml('<img src=x onerror=alert(1)>')).toBe(false);
    expect(isSafeSnippetHtml('<script>alert(1)</script>')).toBe(false);
    expect(isSafeSnippetHtml('<mark>ok</mark> <b>bad</b>')).toBe(false);
  });
});

describe('searchMoods', () => {
  test('skips too-short queries, builds the endpoint URL, and surfaces HTTP errors', async () => {
    const requested: string[] = [];
    let fail = false;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requested.push(String(input));
      if (fail) return new Response('boom', { status: 500 });
      return Response.json({ results: [{ id: '1', datetime: '', snippet: 'x', tags: [] }] });
    }) as typeof fetch;

    expect(await searchMoods('c')).toEqual([]);
    expect(requested).toHaveLength(0);
    expect(await searchMoods('calm', { limit: 6 })).toHaveLength(1);
    expect(requested[0]).toContain('q=calm');
    expect(requested[0]).toContain('limit=6');
    fail = true;
    await expect(searchMoods('anger')).rejects.toThrow('Mood search failed (500)');
    expect(requested).toHaveLength(2);
  });
});
