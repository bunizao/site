import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '../..');
const showcasedSlugs = [
  'projects-deck',
  'mood-wheel',
  'decode-text',
  'contact-links',
  'listening',
  'mobile-reading-bar',
  'tag-cards',
  'github-activity',
  'update-pills',
  'list-hover',
] as const;

function readText(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

describe('components showcase registry', () => {
  test('gives every index specimen its own detail page and preview', () => {
    const index = readText('src/pages/components/index.astro');
    const preview = readText('src/features/components/ui/ComponentPreview.astro');

    for (const slug of showcasedSlugs) {
      expect(index).toContain(`href="/components/${slug}"`);
      expect(existsSync(join(root, `src/content/components/${slug}.md`))).toBe(true);
      expect(preview).toContain(`'${slug}'`);
    }
  });

  test('uses extensionless endpoints and registry installers', () => {
    const detail = readText('src/pages/components/[slug].astro');
    const registry = readText('src/features/components/server/registry.ts');
    const headers = readText('public/_headers');

    expect(detail).toContain('`/r/${slug}`');
    expect(existsSync(join(root, 'src/pages/r/[name].ts'))).toBe(true);
    expect(existsSync(join(root, 'src/pages/r/[name].json.ts'))).toBe(true);
    expect(headers).toContain('https://buxx.me/r/*');
    expect(headers).toContain('Content-Type: application/json; charset=utf-8');
    for (const slug of showcasedSlugs) {
      const content = readText(`src/content/components/${slug}.md`);
      expect(content).toContain('type: registry');
      expect(registry).toContain(slug);
    }
  });
});
