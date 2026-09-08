import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { canonical } from '@/lib/seo';
import { postPath, tagPath } from '@/features/posts/format';
import {
  getAccessiblePosts,
  getListedPosts,
  getPublicTagDirectory,
} from '@/features/posts/server/content';
import { getPostVersions } from '@/features/posts/i18n';
import { docPath, getDocsNav } from '@/features/docs/server/nav';

export const prerender = true;

// The one sitemap. Every indexable public HTML page is listed here or is a
// bug; every page that is noindex, gated, or a dev harness is absent on
// purpose. `priority` and `changefreq` are not emitted: Google ignores both,
// and a `lastmod` that is really "build time" is noise, so only pages with a
// real edit date carry one.
const STATIC_PAGES = [
  '/',
  '/projects',
  '/mood',
  '/privacy',
  '/blog',
  '/blog/tags',
  '/docs',
  '/components',
];

function urlEntry(path: string, lastmod?: string): string {
  const lines = ['  <url>', `    <loc>${canonical(path)}</loc>`];
  if (lastmod) lines.push(`    <lastmod>${lastmod}</lastmod>`);
  lines.push('  </url>');
  return lines.join('\n');
}

export async function collectSitemapPaths(): Promise<Array<{ path: string; lastmod?: string }>> {
  const [posts, accessiblePosts, tags, docsGroups, components] = await Promise.all([
    getListedPosts(),
    getAccessiblePosts(),
    getPublicTagDirectory(),
    getDocsNav(),
    getCollection('components', ({ data }) => !data.draft),
  ]);

  // The listing carries one row per article; the sitemap deliberately does not.
  // A `?lang=` variant is a form Google indexes, and a translation that is not
  // in here is a translation nobody finds — its own build path is not a public
  // URL and 301s away.
  const postEntries = posts.flatMap((post) => {
    const versions = getPostVersions(post, accessiblePosts);
    const paths = versions.length > 0
      ? versions.map((version) => version.indexedHref)
      : [postPath(post.slug)];
    const lastmod = post.updatedAt || post.publishedAt;
    return paths.map((path) => ({ path, lastmod }));
  });

  return [
    ...STATIC_PAGES.map((path) => ({ path })),
    ...docsGroups.flatMap((group) => group.entries.map((entry) => ({ path: docPath(entry.id) }))),
    ...components.map((entry) => ({ path: `/components/${entry.id}` })),
    ...postEntries,
    ...tags.map((tag) => ({ path: tagPath(tag.slug) })),
  ];
}

export const GET: APIRoute = async () => {
  const entries = await collectSitemapPaths();

  return new Response(
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...entries.map(({ path, lastmod }) => urlEntry(path, lastmod)),
      '</urlset>',
    ].join('\n'),
    {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
      },
    },
  );
};
