import { describe, expect, test } from 'bun:test';

import {
  buildVariantCacheKey,
  shouldBypassEdgeCache,
} from '@/lib/http/edge-cache';

describe('variant edge cache', () => {
  test('builds separate keys for html and markdown variants', () => {
    const request = new Request('https://buxx.me/blog/demo-effects/?utm=ignored');
    const htmlKey = buildVariantCacheKey(request, {
      namespace: 'content',
      variant: 'html',
      version: '1',
    });
    const markdownKey = buildVariantCacheKey(request, {
      namespace: 'content',
      variant: 'markdown',
      version: '1',
    });

    expect(htmlKey.url).not.toBe(markdownKey.url);
    expect(new URL(htmlKey.url).searchParams.get('variant')).toBe('html');
    expect(new URL(markdownKey.url).searchParams.get('variant')).toBe('markdown');
    expect(new URL(htmlKey.url).searchParams.get('path')).toBe('/blog/demo-effects/');
  });

  test('honors explicit client cache bypass headers', () => {
    expect(shouldBypassEdgeCache(new Request('https://buxx.me/mood'))).toBe(false);
    expect(shouldBypassEdgeCache(new Request('https://buxx.me/mood', {
      headers: { 'Cache-Control': 'no-cache' },
    }))).toBe(true);
    expect(shouldBypassEdgeCache(new Request('https://buxx.me/mood', {
      headers: { Pragma: 'no-cache' },
    }))).toBe(true);
  });
});
