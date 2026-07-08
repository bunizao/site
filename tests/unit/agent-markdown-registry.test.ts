import { describe, expect, test } from 'bun:test';

import {
  getContentRoutePolicy,
  hasMarkdownRenderer,
} from '@/features/agent-markdown/server/registry';
import {
  cloudflareCdnCacheControl,
  publicCacheControl,
  renderMarkdownIfRequested,
  withContentPolicy,
} from '@/features/agent-markdown/server/responses';

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

  test('adds stale revalidation to shared content cache headers', () => {
    expect(publicCacheControl(60, true)).toBe(
      'public, max-age=0, s-maxage=60, no-transform'
    );
    expect(cloudflareCdnCacheControl(60)).toBe(
      'public, max-age=60, stale-while-revalidate=300'
    );
  });

  test('sets edge-only freshness for Worker-cached content routes', () => {
    const response = withContentPolicy(
      new Request('https://buxx.me/mood'),
      new Response('<!doctype html><main data-mood-initial-feed data-mood-id="1"></main>', {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      }),
    );

    expect(response.headers.get('Cache-Control')).toBe(
      'public, max-age=0, s-maxage=60, no-transform'
    );
    expect(response.headers.get('Cloudflare-CDN-Cache-Control')).toBe(
      'public, max-age=60, stale-while-revalidate=300'
    );
    expect(response.headers.get('Vary')).toBe('Accept');
  });

  test('prevents heuristic Worker caching on unregistered HTML routes', async () => {
    const response = withContentPolicy(
      new Request('https://buxx.me/subscribe/manage'),
      new Response('<!doctype html>', {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-transform',
        },
      }),
    );

    expect(response.headers.get('Cache-Control')).toBe('no-transform, no-store, max-age=0');
    expect(response.headers.has('Cloudflare-CDN-Cache-Control')).toBe(false);
  });

  test('keeps markdown error responses out of Worker cache', async () => {
    const response = await renderMarkdownIfRequested({
      request: new Request('https://buxx.me/mood?before=bad', {
        headers: { Accept: 'text/markdown' },
      }),
      locals: {},
    });

    expect(response?.status).toBe(400);
    expect(response?.headers.get('Cache-Control')).toBe('no-store, max-age=0');
    expect(response?.headers.has('Cloudflare-CDN-Cache-Control')).toBe(false);
  });
});
