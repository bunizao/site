import { describe, expect, test } from 'bun:test';

import { getContentRoutePolicy } from '@/features/agent-markdown/server/registry';

// A socially-shared mood link commonly carries a click-id or campaign tag
// (fbclid, utm_*, ...). These params never change what the page renders, so
// they must not force the feed/detail cache policy to treat the URL as
// uncacheable — see the "mood-query-string-forces-no-store" finding.
describe('mood tracking-param cache normalization', () => {
  test('/mood feed ignores a lone tracking param, same as no query string', () => {
    const policy = getContentRoutePolicy('/mood');
    const clean = policy?.normalizeHtmlCacheSearch?.(new URL('https://buxx.me/mood'));

    expect(clean).toBe('');
    expect(policy?.normalizeHtmlCacheSearch?.(new URL('https://buxx.me/mood?fbclid=abc123')))
      .toBe(clean);
    expect(policy?.normalizeHtmlCacheSearch?.(new URL('https://buxx.me/mood?utm_source=twitter')))
      .toBe(clean);
    expect(policy?.normalizeHtmlCacheSearch?.(new URL('https://buxx.me/mood?igshid=x&gclid=y')))
      .toBe(clean);
  });

  test('/mood feed strips tracking params alongside a real tag filter', () => {
    const policy = getContentRoutePolicy('/mood');

    expect(policy?.normalizeHtmlCacheSearch?.(new URL('https://buxx.me/mood?tag=coding')))
      .toBe('?tag=coding');
    expect(
      policy?.normalizeHtmlCacheSearch?.(
        new URL('https://buxx.me/mood?tag=coding&utm_source=twitter&utm_campaign=launch'),
      ),
    ).toBe('?tag=coding');
  });

  test('/mood feed strips tracking params alongside a real anchor id', () => {
    const policy = getContentRoutePolicy('/mood');

    expect(policy?.normalizeHtmlCacheSearch?.(new URL('https://buxx.me/mood?post=990001')))
      .toBe('?post=990001');
    expect(
      policy?.normalizeHtmlCacheSearch?.(new URL('https://buxx.me/mood?post=990001&fbclid=abc')),
    ).toBe('?post=990001');
    expect(policy?.normalizeHtmlCacheSearch?.(new URL('https://buxx.me/mood?3631&si=xyz')))
      .toBe('?3631');
  });

  test('/mood feed still forces no-store for a real, non-tracking param', () => {
    const policy = getContentRoutePolicy('/mood');

    expect(policy?.normalizeHtmlCacheSearch?.(new URL('https://buxx.me/mood?source=live')))
      .toBeNull();
    expect(
      policy?.normalizeHtmlCacheSearch?.(new URL('https://buxx.me/mood?tag=coding&source=live')),
    ).toBeNull();
  });

  test('/mood/[id] detail ignores tracking params, same as the bare URL', () => {
    const policy = getContentRoutePolicy('/mood/990001');
    const clean = policy?.normalizeHtmlCacheSearch?.(new URL('https://buxx.me/mood/990001'));

    expect(clean).toBe('');
    expect(
      policy?.normalizeHtmlCacheSearch?.(new URL('https://buxx.me/mood/990001?utm_source=x')),
    ).toBe(clean);
    expect(
      policy?.normalizeHtmlCacheSearch?.(
        new URL('https://buxx.me/mood/990001?fbclid=a&mc_cid=b&mc_eid=c'),
      ),
    ).toBe(clean);
  });

  test('/mood/[id] detail still forces no-store for a real param', () => {
    const policy = getContentRoutePolicy('/mood/990001');

    expect(policy?.normalizeHtmlCacheSearch?.(new URL('https://buxx.me/mood/990001?source=live')))
      .toBeNull();
    expect(
      policy?.normalizeHtmlCacheSearch?.(
        new URL('https://buxx.me/mood/990001?source=live&fbclid=a'),
      ),
    ).toBeNull();
  });
});
