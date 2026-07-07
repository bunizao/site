import { describe, expect, test } from 'bun:test';

import {
  getContentRoutePolicy,
  hasMarkdownRenderer,
} from '@/features/agent-markdown/server/registry';

describe('agent markdown registry', () => {
  test('matches mood detail ids without stealing sibling mood utility routes', () => {
    expect(hasMarkdownRenderer('/mood/990001')).toBe(true);
    expect(hasMarkdownRenderer('/mood/rss.xml')).toBe(false);
    expect(hasMarkdownRenderer('/mood/embed')).toBe(false);
    expect(hasMarkdownRenderer('/mood/subscribe')).toBe(false);
    expect(getContentRoutePolicy('/mood/embed')).toBeNull();
    expect(getContentRoutePolicy('/mood/subscribe')).toBeNull();
  });

  test('declares cache policy for static discovery and content routes', () => {
    expect(getContentRoutePolicy('/llms.txt')?.cacheTtlSeconds).toBe(300);
    expect(getContentRoutePolicy('/projects')?.cacheTtlSeconds).toBe(300);
    expect(getContentRoutePolicy('/sitemap.xml')?.cacheTtlSeconds).toBe(300);
    expect(getContentRoutePolicy('/blog/rss.xml')?.cacheTtlSeconds).toBe(300);
    expect(getContentRoutePolicy('/mood/rss.xml')?.cacheTtlSeconds).toBe(300);
  });
});
