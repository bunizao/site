import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';
import { blog, meta, profile } from '@/data/site';
import { formatSiteTitle, profileJsonLd, websiteJsonLd } from '@/lib/seo';

function readSource(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

describe('search indexing policy', () => {
  test('assigns one canonical name to each public identity role', () => {
    expect(meta).toMatchObject({
      siteName: 'buxx.me',
      homeTitle: 'Lucian Bu — Student, Developer & Blogger',
    });
    expect(profile).toMatchObject({
      name: 'Lucian Bu',
      alternateNames: ['Bunizao', 'Tutu', 'Collapsar'],
    });
    expect(blog.name).toBe('無人之境');
    expect(formatSiteTitle('Projects')).toBe('Projects — buxx.me');
  });

  test('links the website and profile without treating the alias as the site name', () => {
    expect(websiteJsonLd).toMatchObject({
      '@type': 'WebSite',
      '@id': 'https://buxx.me/#website',
      name: 'buxx.me',
      publisher: { '@id': 'https://buxx.me/#person' },
    });
    expect(profileJsonLd).toMatchObject({
      '@type': 'ProfilePage',
      name: 'Lucian Bu',
      isPartOf: { '@id': 'https://buxx.me/#website' },
      mainEntity: {
        '@type': 'Person',
        name: 'Lucian Bu',
        alternateName: ['Bunizao', 'Tutu', 'Collapsar'],
      },
    });
  });

  test('indexes the mood hub without indexing the unbounded detail archive', () => {
    const feed = readSource('src/pages/mood.astro');
    const detail = readSource('src/pages/mood/[id].astro');

    expect(feed).not.toContain('robots="noindex');
    expect(detail).toContain('robots="noindex, follow"');
  });

  test('keeps blog article title signals branded and structured', () => {
    const layout = readSource('src/layouts/BlogLayout.astro');

    expect(layout).toContain('`${pageTitle} — ${blog.name}`');
    expect(layout).toContain('<title>{fullTitle}</title>');
    expect(layout).toContain("'@type': 'BlogPosting'");
    expect(layout).toContain("name: blog.name");
    expect(layout).toContain('url: new URL(BLOG_FAVICON, meta.siteUrl).href');
  });
});
