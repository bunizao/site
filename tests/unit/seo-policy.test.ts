import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';
import { blog, meta, profile } from '@/data/site';
import { breadcrumbJsonLd, formatSiteTitle, profileJsonLd, websiteJsonLd } from '@/lib/seo';

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
      penNames: ['Murray'],
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
        alternateName: ['Bunizao', 'Tutu', 'Collapsar', 'Murray'],
      },
    });
  });

  test('indexes the mood hub without indexing the unbounded detail archive', () => {
    const feed = readSource('src/pages/mood.astro');
    const detail = readSource('src/pages/mood/[id].astro');

    expect(feed).not.toContain('robots="noindex');
    expect(detail).toContain('robots="noindex, follow"');
  });

  test('keeps every dev harness and preview page out of the index', () => {
    const noindexPages = [
      'src/pages/lab/comments.astro',
      'src/pages/lab/reader-confirm.astro',
      'src/pages/lab/background.astro',
      'src/pages/lab/glyph.astro',
      'src/pages/components/preview/mobile-toc.astro',
      'src/pages/components/preview/mood-wheel.astro',
      'src/pages/probe-safe-area.astro',
      'src/pages/mood/embed.astro',
      'src/pages/message.astro',
      'src/pages/subscribe/manage.astro',
      'src/layouts/PortalLayout.astro',
    ];

    for (const page of noindexPages) {
      expect(readSource(page)).toMatch(/robots(="|" content=")noindex/);
    }
  });

  test('ships one sitemap and a robots.txt that points at it', () => {
    const robots = readSource('public/robots.txt');
    const robotsRules = robots
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));

    expect(robotsRules).toContain('User-agent: *');
    expect(robotsRules).toContain('Sitemap: https://buxx.me/sitemap.xml');
    expect(robotsRules).toContain('Disallow: /api/');
    expect(robotsRules).toContain('Disallow: /dev/');
    // Never block the whole site, and never block a page that relies on a
    // `noindex` meta tag being crawled.
    expect(robotsRules).not.toContain('Disallow: /');
    expect(robotsRules.some((rule) => /^Disallow: \/(mood|blog|message|lab)/.test(rule))).toBe(false);
    expect(robots.match(/^Sitemap:/gm)).toHaveLength(1);

    expect(readSource('astro.config.mjs')).not.toContain('@astrojs/sitemap');
    expect(readSource('package.json')).not.toContain('@astrojs/sitemap');
  });

  test('builds breadcrumb trails from canonical paths', () => {
    expect(
      breadcrumbJsonLd([
        { name: 'buxx.me', path: '/' },
        { name: 'Docs', path: '/docs' },
        { name: 'Overview', path: '/docs/overview' },
      ]),
    ).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'buxx.me', item: 'https://buxx.me/' },
        { '@type': 'ListItem', position: 2, name: 'Docs', item: 'https://buxx.me/docs' },
        { '@type': 'ListItem', position: 3, name: 'Overview', item: 'https://buxx.me/docs/overview' },
      ],
    });
  });

  test('keeps blog article title signals branded and structured', () => {
    const layout = readSource('src/layouts/BlogLayout.astro');

    expect(layout).toContain('`${pageTitle} — ${blog.name}`');
    expect(layout).toContain('<title>{fullTitle}</title>');
    expect(layout).toContain("'@type': 'BlogPosting'");
    expect(layout).toContain("'@id': `${meta.siteUrl}/#person`");
    expect(layout).toContain('{ alternateName: resolvedAuthorName }');
    expect(layout).toContain("name: blog.name");
    expect(layout).toContain('url: new URL(BLOG_FAVICON, meta.siteUrl).href');
  });
});
