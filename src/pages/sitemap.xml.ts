import type { APIRoute } from 'astro';
import { canonical } from '@/lib/seo';

export const prerender = true;

const pages = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/mood', priority: '0.8', changefreq: 'daily' },
  { path: '/privacy', priority: '0.3', changefreq: 'yearly' },
];

export const GET: APIRoute = () => {
  const updatedAt = new Date().toISOString();
  const urls = pages
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

  return new Response(
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      urls,
      '</urlset>',
    ].join('\n'),
    {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
      },
    },
  );
};
