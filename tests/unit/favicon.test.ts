import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { blog } from '@/data/site';

function readEmbeddedWebp(source: string): Buffer {
  const match = source.match(/data:image\/webp;base64,([^"']+)/);
  if (!match) throw new Error('Embedded WebP favicon payload is missing');
  return Buffer.from(match[1], 'base64');
}

describe('favicons', () => {
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

describe('blog mark on pages', () => {
  test('pages draw the 144px copy, og:logo keeps the full-size mark', () => {
    expect(blog.mark).toBe('/blog-mark-144.webp');
    expect(blog.logo).toBe('/blog-mark.webp');
  });

  test('the page copy is a 144px WebP, 3x the largest 48px slot', () => {
    const mark = readFileSync(new URL('../../public/blog-mark-144.webp', import.meta.url));

    expect(mark.subarray(0, 4).toString()).toBe('RIFF');
    expect(mark.subarray(8, 12).toString()).toBe('WEBP');
    // VP8X canvas size: 24-bit little-endian width-1 and height-1.
    expect(mark.readUIntLE(24, 3) + 1).toBe(144);
    expect(mark.readUIntLE(27, 3) + 1).toBe(144);
  });
});
