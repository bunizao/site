import type { APIRoute } from 'astro';
import { canonical } from '@/lib/seo';
import { postPath, tagPath } from '@/features/posts/format';
import {
  getAccessiblePosts,
  getListedPosts,
  getPublicTagDirectory,
} from '@/features/posts/server/content';
import { getPostVersions } from '@/features/posts/i18n';

export const prerender = true;

const pages = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/mood', priority: '0.8', changefreq: 'daily' },
  { path: '/privacy', priority: '0.3', changefreq: 'yearly' },
  { path: '/blog/', priority: '0.7', changefreq: 'weekly' },
];

export const GET: APIRoute = async () => {
  const updatedAt = new Date().toISOString();
  const [posts, accessiblePosts, tags] = await Promise.all([
    getListedPosts(),
    getAccessiblePosts(),
    getPublicTagDirectory(),
  ]);
  const staticUrls = pages
    .map(({ path, priority, changefreq }) => {
      return [
        '  <url>',
        `    <loc>${canonical(path)}</loc>`,
        `    <lastmod>${updatedAt}</lastmod>`,
        `    <changefreq>${changefreq}</changefreq>`,
        `    <priority>${priority}</priority>`,
        '  </url>',
      ].join('\n');
    })
    .join('\n');
  // The listing carries one row per article; the sitemap deliberately does not.
  // A `?lang=` variant is a form Google indexes, and a translation that is not
  // in here is a translation nobody finds — its own build path is not a public
  // URL and 301s away.
  const postUrls = posts
    .flatMap((post) => {
      const versions = getPostVersions(post, accessiblePosts);
      const paths = versions.length > 0
        ? versions.map((version) => version.indexedHref)
        : [postPath(post.slug)];

      return paths.map((path) => [
        '  <url>',
        `    <loc>${canonical(path)}</loc>`,
        `    <lastmod>${post.updatedAt || post.publishedAt}</lastmod>`,
        '    <changefreq>monthly</changefreq>',
        '    <priority>0.6</priority>',
        '  </url>',
      ].join('\n'));
    })
    .join('\n');
  const tagUrls = tags
    .map((tag) => [
      '  <url>',
      `    <loc>${canonical(tagPath(tag.slug))}</loc>`,
      `    <lastmod>${updatedAt}</lastmod>`,
      '    <changefreq>weekly</changefreq>',
      '    <priority>0.4</priority>',
      '  </url>',
    ].join('\n'))
    .join('\n');

  return new Response(
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      staticUrls,
      postUrls,
      tagUrls,
      '</urlset>',
    ].join('\n'),
    {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
      },
    },
  );
};
