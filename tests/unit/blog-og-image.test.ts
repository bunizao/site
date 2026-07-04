import { describe, expect, test } from 'bun:test';

import {
  BLOG_OG_IMAGE_HEIGHT,
  BLOG_OG_IMAGE_WIDTH,
  DEFAULT_BLOG_OG_IMAGE_ENDPOINT,
  buildBlogOgImageUrl,
  getBlogOgImageEndpoint,
  normalizeBlogMetaText,
} from '@/features/posts/server/og-image';

describe('blog Open Graph image URLs', () => {
  test('uses the configured public OGIS endpoint', () => {
    expect(getBlogOgImageEndpoint({
      env: {
        PUBLIC_BLOG_OG_IMAGE_ENDPOINT: 'https://og.example.test/api/custom',
      },
    })).toBe('https://og.example.test/api/custom');
  });

  test('falls back to the shared OGIS endpoint when config is missing or invalid', () => {
    expect(getBlogOgImageEndpoint({ env: {} })).toBe(DEFAULT_BLOG_OG_IMAGE_ENDPOINT);
    expect(getBlogOgImageEndpoint({ endpoint: 'file:///tmp/og' })).toBe(DEFAULT_BLOG_OG_IMAGE_ENDPOINT);
  });

  test('serializes article metadata into OGIS query parameters', () => {
    const url = new URL(buildBlogOgImageUrl(
      {
        title: 'A small article',
        site: '無人之境',
        excerpt: 'A precise summary.',
        author: 'Lucian Bu',
        date: 'June 28, 2026',
        image: 'https://blog.buxx.me/content/images/2026/06/post.jpg',
      },
      {
        endpoint: 'https://og.example.test/api/og',
      },
    ));

    expect(url.origin + url.pathname).toBe('https://og.example.test/api/og');
    expect(url.searchParams.get('title')).toBe('A small article');
    expect(url.searchParams.get('site')).toBe('無人之境');
    expect(url.searchParams.get('theme')).toBe('pixel');
    expect(url.searchParams.get('excerpt')).toBe('A precise summary.');
    expect(url.searchParams.get('author')).toBe('Lucian Bu');
    expect(url.searchParams.get('date')).toBe('June 28, 2026');
    expect(url.searchParams.get('image')).toBe('https://blog.buxx.me/content/images/2026/06/post.jpg');
    expect(BLOG_OG_IMAGE_WIDTH).toBe(1200);
    expect(BLOG_OG_IMAGE_HEIGHT).toBe(630);
  });

  test('normalizes long prose before it reaches metadata and query strings', () => {
    const longText = `First line

      ${'word '.repeat(80)}last`;
    const normalized = normalizeBlogMetaText(longText, 48);
    const url = new URL(buildBlogOgImageUrl({
      title: 'Title',
      excerpt: longText,
    }));

    expect(normalized.length).toBeLessThanOrEqual(48);
    expect(normalized).not.toContain('\n');
    expect(url.searchParams.get('excerpt')?.length).toBeLessThanOrEqual(220);
    expect(url.toString().length).toBeLessThan(500);
  });
});
