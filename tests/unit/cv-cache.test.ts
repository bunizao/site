import { describe, expect, test } from 'bun:test';

import {
  cacheHtmlPageResponse,
  readCachedHtmlPage,
  withContentPolicy,
} from '@/features/agent-markdown/server/responses';
import {
  hasCvFullCookie,
  isCvFullHtmlRequest,
  normalizeCvHtmlCacheSearch,
} from '@/features/cv/server/cache';

describe('CV HTML cache policy', () => {
  test('normalizes anonymous CV cache keys to the SSR language only', () => {
    expect(normalizeCvHtmlCacheSearch(new URL('https://buxx.me/cv'))).toBe('');
    expect(normalizeCvHtmlCacheSearch(new URL('https://buxx.me/cv?utm_source=x'))).toBe('');
    expect(normalizeCvHtmlCacheSearch(new URL('https://buxx.me/cv?lang=zh&utm_source=x'))).toBe('?lang=zh');
  });

  test('bypasses cache for magic-link redeem URLs and full-view cookies', async () => {
    expect(normalizeCvHtmlCacheSearch(new URL('https://buxx.me/cv?key=secret'))).toBeNull();
    expect(hasCvFullCookie(new Request('https://buxx.me/cv', {
      headers: { Cookie: 'theme=dark; cv_full=abc.123; other=1' },
    }))).toBe(true);
    expect(isCvFullHtmlRequest(new Request('https://buxx.me/cv/', {
      headers: { Cookie: 'cv_full=abc.123' },
    }))).toBe(true);
    expect(isCvFullHtmlRequest(new Request('https://buxx.me/cv', {
      headers: { 'cf-access-jwt-assertion': 'access.jwt.test' },
    }))).toBe(true);

    const stored = await cacheHtmlPageResponse(
      new Request('https://cv-cache-key.test/cv?key=secret'),
      new Response('<!doctype html><p>full redirect</p>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }),
    );

    expect(stored.headers.has('X-Buxx-Edge-Cache')).toBe(false);
    expect(await readCachedHtmlPage(new Request('https://cv-cache-key.test/cv'))).toBeNull();
  });

  test('stores and reuses only anonymous redacted CV HTML', async () => {
    const firstRequest = new Request('https://cv-cache-public.test/cv?utm_source=feed');
    const secondRequest = new Request('https://cv-cache-public.test/cv?fbclid=ignored');
    const fullCookieRequest = new Request('https://cv-cache-public.test/cv', {
      headers: { Cookie: 'cv_full=token' },
    });
    const accessRequest = new Request('https://cv-cache-public.test/cv', {
      headers: { 'cf-access-jwt-assertion': 'access.jwt.test' },
    });

    const stored = await cacheHtmlPageResponse(
      firstRequest,
      new Response('<!doctype html><p>public cv</p>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }),
    );
    const cached = await readCachedHtmlPage(secondRequest);

    expect(stored.headers.get('X-Buxx-Edge-Cache')).toBe('MISS');
    expect(cached?.headers.get('X-Buxx-Edge-Cache')).toBe('HIT');
    expect(await cached?.text()).toBe('<!doctype html><p>public cv</p>');
    expect(await readCachedHtmlPage(fullCookieRequest)).toBeNull();
    expect(await readCachedHtmlPage(accessRequest)).toBeNull();
  });

  test('adds public cache headers only to anonymous CV HTML', () => {
    const anonymous = withContentPolicy(
      new Request('https://buxx.me/cv'),
      new Response('<!doctype html>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }),
    );
    const full = withContentPolicy(
      new Request('https://buxx.me/cv', { headers: { Cookie: 'cv_full=token' } }),
      new Response('<!doctype html>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }),
    );
    const ownerAccess = withContentPolicy(
      new Request('https://buxx.me/cv', { headers: { 'cf-access-jwt-assertion': 'access.jwt.test' } }),
      new Response('<!doctype html>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }),
    );

    expect(anonymous.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=300');
    expect(full.headers.get('Cache-Control')).toBe('no-store, max-age=0');
    expect(ownerAccess.headers.get('Cache-Control')).toBe('no-store, max-age=0');
  });
});
