import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { redirectLegacyGhostHost } from '../../src/lib/http/legacy-ghost-redirect';

type RedirectRule = {
  source: string;
  target: string;
  status: number;
};

const redirectsFile = readFileSync(join(import.meta.dir, '../../public/_redirects'), 'utf8');
const rules = redirectsFile
  .split('\n')
  .map((line) => line.replace(/\s+#.*$/, '').trim())
  .filter((line) => line.length > 0 && !line.startsWith('#'))
  .map((line): RedirectRule => {
    const [source, target, status = '302'] = line.split(/\s+/);
    return { source, target, status: Number(status) };
  });

function findRedirect(pathname: string): RedirectRule | null {
  return rules.find((rule) => rule.source === pathname) ?? null;
}

function expectPermanentRedirect(response: Response | null, location: string) {
  expect(response?.status).toBe(301);
  expect(response?.headers.get('Location')).toBe(location);
}

describe('Cloudflare blog redirects', () => {
  test('redirects legacy Ghost sitemap paths to the local blog', () => {
    expect(findRedirect('/sacrifice')).toEqual({
      source: '/sacrifice',
      target: '/blog/sacrifice',
      status: 301,
    });
    expect(findRedirect('/sacrifice/')).toMatchObject({
      target: '/blog/sacrifice',
      status: 301,
    });
    expect(findRedirect('/author/murray')).toMatchObject({
      target: '/blog',
      status: 301,
    });
    expect(findRedirect('/tag/prose/')).toMatchObject({
      target: '/blog/tag/prose',
      status: 301,
    });
  });

  test('redirects blog reserved path aliases to canonical feeds and sitemaps', () => {
    expect(findRedirect('/blog/rss')).toEqual({
      source: '/blog/rss',
      target: '/blog/rss.xml',
      status: 301,
    });
    expect(findRedirect('/blog/rss/')).toMatchObject({
      target: '/blog/rss.xml',
      status: 301,
    });
    expect(findRedirect('/blog/feed')).toMatchObject({
      target: '/blog/rss.xml',
      status: 301,
    });
    expect(findRedirect('/blog/feed/')).toMatchObject({
      target: '/blog/rss.xml',
      status: 301,
    });
    expect(findRedirect('/blog/sitemap.xml')).toMatchObject({
      target: '/sitemap.xml',
      status: 301,
    });
    expect(findRedirect('/blog/sitemap-posts.xml')).toMatchObject({
      target: '/sitemap.xml',
      status: 301,
    });
  });

  test('redirects the Ghost subdomain into canonical blog URLs', () => {
    const redirectModule = readFileSync(join(import.meta.dir, '../../src/lib/http/legacy-ghost-redirect.ts'), 'utf8');

    expect(redirectModule).toContain("url.hostname !== 'blog.buxx.me'");
    expect(redirectModule).toContain("Response.redirect('https://buxx.me/blog', 301)");
    expect(redirectModule).toContain('https://buxx.me/blog/tag/');
    expect(redirectModule).toContain('https://buxx.me/blog/tags');
    expect(redirectModule).toContain('https://buxx.me/blog/rss.xml');
    expect(redirectModule).toContain('https://buxx.me/sitemap.xml');
    expect(redirectModule).toContain('/content/images/');
  });

  test('maps legacy Ghost reserved host paths before slug redirects', async () => {
    expectPermanentRedirect(
      redirectLegacyGhostHost(new URL('https://blog.buxx.me/rss/')),
      'https://buxx.me/blog/rss.xml',
    );
    expectPermanentRedirect(
      redirectLegacyGhostHost(new URL('https://blog.buxx.me/feed/')),
      'https://buxx.me/blog/rss.xml',
    );
    expectPermanentRedirect(
      redirectLegacyGhostHost(new URL('https://blog.buxx.me/sitemap.xml')),
      'https://buxx.me/sitemap.xml',
    );
    expectPermanentRedirect(
      redirectLegacyGhostHost(new URL('https://blog.buxx.me/sitemap-posts.xml')),
      'https://buxx.me/sitemap.xml',
    );
    expectPermanentRedirect(
      redirectLegacyGhostHost(new URL('https://blog.buxx.me/content/images/2026/06/post.jpg')),
      'https://buxx.me/api/v2/images/blog/content/images/2026/06/post.jpg',
    );
    expectPermanentRedirect(
      redirectLegacyGhostHost(new URL('https://blog.buxx.me/content/images/size/w600/2026/06/post.jpg?quality=80')),
      'https://buxx.me/api/v2/images/blog/content/images/2026/06/post.jpg?quality=80&w=600',
    );
    expect(redirectLegacyGhostHost(new URL('https://blog.buxx.me/robots.txt'))).toBeNull();
    expectPermanentRedirect(
      redirectLegacyGhostHost(new URL('https://blog.buxx.me/some-post/')),
      'https://buxx.me/blog/some-post',
    );
  });

  test('does not keep a global fallback redirect', () => {
    expect(findRedirect('/random-missing-page')).toBeNull();
    expect(findRedirect('/api/moods')).toBeNull();
    expect(findRedirect('/mood')).toBeNull();
    expect(findRedirect('/tag/not-in-sitemap')).toBeNull();
  });

  test('keeps redirects in Cloudflare static asset format', () => {
    expect(rules).toHaveLength(57);
    expect(rules.every((rule) => rule.source.startsWith('/'))).toBe(true);
    expect(rules.every((rule) => rule.target.startsWith('/blog') || rule.target === '/sitemap.xml')).toBe(true);
    expect(rules.every((rule) => rule.status === 301)).toBe(true);
  });
});
