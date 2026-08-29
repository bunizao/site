import { afterEach, describe, expect, test } from 'bun:test';

import {
  fetchBlogAsset,
  resolveBlogRequest,
  cacheHtmlPageResponse,
  readCachedHtmlPage,
} from '@/features/agent-markdown/server/responses';
import {
  manifestEntryForPath,
  resetI18nManifestForTests,
  type I18nManifest,
} from '@/features/posts/server/i18n-manifest';
import { resolveRequestLocale } from '@/features/posts/i18n';

const manifest: I18nManifest = {
  'quiet-architecture': { translations: { en: 'on-quiet-architecture' } },
  'on-quiet-architecture': { canonical: 'quiet-architecture', locale: 'en' },
};

function assets() {
  let manifestReads = 0;
  const binding = {
    fetch: async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.pathname === '/_i18n/posts.json') {
        manifestReads += 1;
        return new Response(JSON.stringify(manifest), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const body = url.pathname.endsWith('on-quiet-architecture')
        ? '<html lang="en">English</html>'
        : '<html lang="zh">中文</html>';
      return new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    },
  };
  return { binding, reads: () => manifestReads };
}

afterEach(() => resetI18nManifestForTests());

describe('production blog i18n edge seam', () => {
  test('applies q ordering, q=0 exclusion, and RFC 4647 lookup', () => {
    expect(resolveRequestLocale({
      availableLocales: ['zh', 'en'],
      acceptLanguage: 'en-GB;q=0.3,zh-CN;q=0.9,en;q=0',
    })).toBe('zh');
    expect(resolveRequestLocale({
      availableLocales: ['zh', 'en'],
      acceptLanguage: 'en-GB;q=1,zh;q=0',
    })).toBe('en');
    expect(resolveRequestLocale({
      availableLocales: ['zh', 'zh-TW', 'en'],
      acceptLanguage: 'zh-TW-Hant;q=1',
    })).toBe('zh-TW');
  });

  test('resolves query, cookie, and weighted Accept-Language in order', async () => {
    const { binding } = assets();
    const locals = { env: { ASSETS: binding } };
    const query = await resolveBlogRequest(
      new Request('https://buxx.me/blog/quiet-architecture?lang=zh', {
        headers: { cookie: 'blog_lang=en', 'accept-language': 'en;q=1' },
      }),
      locals,
    );
    expect(query?.locale).toBe('zh');

    const cookie = await resolveBlogRequest(
      new Request('https://buxx.me/blog/quiet-architecture', {
        headers: { cookie: 'blog_lang=en', 'accept-language': 'zh;q=1' },
      }),
      locals,
    );
    expect(cookie?.locale).toBe('en');

    const mixedCase = await resolveBlogRequest(
      new Request('https://buxx.me/blog/quiet-architecture?lang=EN', {
        headers: { cookie: 'blog_lang=zh' },
      }),
      locals,
    );
    expect(mixedCase?.locale).toBe('en');
  });

  test('serves the translation asset and caches it by locale without CDN URL caching', async () => {
    const { binding, reads } = assets();
    const locals = { env: { ASSETS: binding } };
    const request = new Request('https://buxx.me/blog/quiet-architecture?lang=EN', {
      headers: { 'accept-language': 'en' },
    });
    const asset = await fetchBlogAsset(request, locals);
    expect(await asset?.clone().text()).toContain('English');
    expect(asset?.headers.get('Content-Language')).toBe('en');
    expect(asset?.headers.get('Vary')).toContain('Cookie');
    expect(asset?.headers.get('Vary')).toContain('Accept-Language');
    expect(asset?.headers.get('Set-Cookie')).toContain('blog_lang=en');

    const stored = await cacheHtmlPageResponse(request, asset! , locals);
    expect(stored.headers.get('X-Buxx-Edge-Cache')).toBe('MISS');
    expect(stored.headers.get('Cloudflare-CDN-Cache-Control')).toBe('no-store');
    const cached = await readCachedHtmlPage(request, locals);
    expect(cached?.headers.get('X-Buxx-Edge-Cache')).toBe('HIT');
    expect(await cached?.text()).toContain('English');
    expect(reads()).toBe(1);
  });

  test('redirects a translation build path and rejects malformed encoded paths', async () => {
    const { binding } = assets();
    const redirect = await resolveBlogRequest(
      new Request('https://buxx.me/blog/on-quiet-architecture'),
      { env: { ASSETS: binding } },
    );
    expect(redirect?.redirect?.status).toBe(301);
    expect(redirect?.redirect?.headers.get('Location')).toBe(
      '/blog/quiet-architecture?lang=en',
    );

    expect(manifestEntryForPath(manifest, '/blog/%ZZ')).toBeNull();
  });
});
