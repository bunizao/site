import { blog, meta } from '@/data/site';
import { canonical } from '@/lib/seo';
import { postPath } from '../format';
import type { Post } from '../types';

const MAX_RSS_ITEMS = 30;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function postUrl(post: Post): string {
  return canonical(postPath(post.slug));
}

function postDescription(post: Post): string {
  return post.customExcerpt || post.excerpt || post.plaintext || '';
}

function rfc822(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toUTCString() : date.toUTCString();
}

export function buildBlogRssXml(posts: Post[]): string {
  const items = posts.slice(0, MAX_RSS_ITEMS).map((post) => {
    const url = postUrl(post);
    const description = postDescription(post);

    return [
      '    <item>',
      `      <title>${escapeXml(post.title)}</title>`,
      `      <link>${escapeXml(url)}</link>`,
      `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
      `      <pubDate>${escapeXml(rfc822(post.publishedAt))}</pubDate>`,
      `      <description>${escapeXml(description)}</description>`,
      '    </item>',
    ].join('\n');
  }).join('\n');

  const updatedAt = posts[0]?.publishedAt ?? new Date(0).toISOString();

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${escapeXml(blog.name)}</title>`,
    `    <description>${escapeXml(blog.copy[blog.locale.blog].tagline)}</description>`,
    `    <link>${escapeXml(canonical('/blog/'))}</link>`,
    `    <atom:link href="${escapeXml(canonical('/blog/rss.xml'))}" rel="self" type="application/rss+xml" />`,
    `    <language>zh-CN</language>`,
    `    <lastBuildDate>${escapeXml(rfc822(updatedAt))}</lastBuildDate>`,
    `    <generator>${escapeXml(meta.siteName)}</generator>`,
    items,
    '  </channel>',
    '</rss>',
  ].filter(Boolean).join('\n');
}
