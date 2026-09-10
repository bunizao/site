import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

  test('folds the retired @astrojs/sitemap output into the single sitemap', () => {
    expect(findRedirect('/sitemap-index.xml')).toEqual({
      source: '/sitemap-index.xml',
      target: '/sitemap.xml',
      status: 301,
    });
    expect(findRedirect('/sitemap-0.xml')).toMatchObject({
      target: '/sitemap.xml',
      status: 301,
    });
  });

  test('does not keep a global fallback redirect', () => {
    expect(findRedirect('/random-missing-page')).toBeNull();
    expect(findRedirect('/api/moods')).toBeNull();
    expect(findRedirect('/mood')).toBeNull();
    expect(findRedirect('/tag/not-in-sitemap')).toBeNull();
  });

  test('keeps the legacy conversation playground URL on the detail page', () => {
    expect(findRedirect('/components/preview/conversation')).toEqual({
      source: '/components/preview/conversation',
      target: '/components/conversation#playground',
      status: 301,
    });
    expect(findRedirect('/components/preview/conversation/')).toMatchObject({
      target: '/components/conversation#playground',
      status: 301,
    });
  });

  test('keeps redirects in Cloudflare static asset format', () => {
    expect(rules).toHaveLength(61);
    expect(rules.every((rule) => rule.source.startsWith('/'))).toBe(true);
    expect(rules.every((rule) => (
      rule.target.startsWith('/blog')
      || rule.target === '/sitemap.xml'
      || rule.target === '/components/conversation#playground'
    ))).toBe(true);
    expect(rules.every((rule) => rule.status === 301)).toBe(true);
  });
});
