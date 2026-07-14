import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CollectionEntry } from 'astro:content';
import { buildRegistryItem } from '../../src/features/components/server/registry';

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

function registryEntry(id: string): CollectionEntry<'components'> {
  return {
    id,
    data: { install: { type: 'registry' } },
  } as CollectionEntry<'components'>;
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

  test('publishes the mobile reading bar as an installable component', async () => {
    const item = await buildRegistryItem(registryEntry('mobile-reading-bar'));

    expect(item).toMatchObject({
      name: 'mobile-reading-bar',
      type: 'registry:ui',
      files: [
        {
          path: 'features/components/ui/MobileReadingBar.astro',
          target: '@ui/mobile-reading-bar.astro',
          type: 'registry:ui',
        },
      ],
    });
    expect(item.files[0]?.content).toContain('interface Props');
    expect(item.files[0]?.content).not.toMatch(/<!doctype html>|<html|<body/);
  });

  test('publishes mood wheel files at stable library targets', async () => {
    const item = await buildRegistryItem(registryEntry('mood-wheel'));

    expect(item.files.map(({ path, target, type }) => ({ path, target, type }))).toEqual([
      {
        path: 'features/mood/client/timeline-wheel.ts',
        target: '@lib/timeline-wheel.ts',
        type: 'registry:lib',
      },
      {
        path: 'features/mood/client/timeline-date-tracker.ts',
        target: '@lib/timeline-date-tracker.ts',
        type: 'registry:lib',
      },
    ]);
    expect(item.files[0]?.content).toContain("from '@/lib/timeline-date-tracker'");
    expect(item.files.some(({ content }) => content.includes('@/features/'))).toBe(false);
  });

  test('does not publish the mascot through the component registry', async () => {
    let message = '';
    try {
      await buildRegistryItem(registryEntry('mascot'));
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toBe('Missing registry configuration for mascot');
  });
});
