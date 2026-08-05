import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

function readEmbeddedWebp(source: string): Buffer {
  const match = source.match(/data:image\/webp;base64,([^"']+)/);
  if (!match) throw new Error('Embedded WebP favicon payload is missing');
  return Buffer.from(match[1], 'base64');
}

describe('favicons', () => {
  test('adapts the blog tab icon while keeping topbar marks as WebP', () => {
    const layout = readFileSync(new URL('../../src/layouts/BlogLayout.astro', import.meta.url), 'utf8');
    const readingTopbar = readFileSync(new URL('../../src/features/posts/ui/ReadingTopbar.astro', import.meta.url), 'utf8');

    // Browser tab strips ignore site CSS, so the favicon carries its own
    // color-scheme rule while in-page marks keep using the shared raster asset.
    expect(layout).toContain("import { BLOG_FAVICON } from '@/lib/favicon';");
    expect(layout).toContain('<link rel="icon" href={BLOG_FAVICON} type="image/svg+xml" />');
    expect(layout).not.toContain('<link rel="icon" href={blogMarkAsset}');
    expect(layout).toContain('const blogMarkAsset = blog.mark;');
    expect(layout).toContain('<img src={blogMarkAsset} alt={blog.name} width="40" height="40" />');
    expect(readingTopbar).toContain('<img src={blog.mark} alt={blog.name} width="30" height="30" />');
  });

  test('badges development tabs and versions production hrefs', () => {
    const favicon = readFileSync(new URL('../../src/lib/favicon.ts', import.meta.url), 'utf8');

    expect(favicon).toContain('import.meta.env.DEV');
    expect(favicon).toContain("'/logo/peek-dev.svg'");
    expect(favicon).toContain("'/blog-mark-dev.svg'");
    expect(favicon).toContain("'/logo/peek.svg?v=3'");
    expect(favicon).toContain("'/blog-mark.svg?v=2'");
  });

  test('keeps embedded blog marks metadata-free WebP', () => {
    const prod = readFileSync(new URL('../../public/blog-mark.svg', import.meta.url), 'utf8');
    const dev = readFileSync(new URL('../../public/blog-mark-dev.svg', import.meta.url), 'utf8');

    expect(prod).toContain('prefers-color-scheme: dark');
    expect(prod).toContain('invert(1)');
    expect(dev).toContain('<rect width="128" height="128" rx="24" fill="#f59e0b"/>');

    for (const source of [prod, dev]) {
      const mark = readEmbeddedWebp(source);
      expect(mark.subarray(0, 4).toString()).toBe('RIFF');
      expect(mark.subarray(8, 12).toString()).toBe('WEBP');
      expect(mark.includes(Buffer.from('EXIF'))).toBe(false);
      expect(source).not.toContain('data:image/png;base64,');
    }
  });

  test('keeps the shared blog mark asset encoded as WebP', () => {
    const mark = readFileSync(new URL('../../public/blog-mark.webp', import.meta.url));

    expect(mark.subarray(0, 4).toString()).toBe('RIFF');
    expect(mark.subarray(8, 12).toString()).toBe('WEBP');
  });
});
