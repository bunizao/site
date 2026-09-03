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
  'conversation',
] as const;
const publishedSlugs = [
  'button',
  'badge',
  'card',
  ...showcasedSlugs,
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
    for (const slug of publishedSlugs) {
      const content = readText(`src/content/components/${slug}.md`);
      expect(content).toContain('type: registry');
      expect(registry).toContain(slug);
    }
  });

  test('builds every published registry payload', async () => {
    const items = await Promise.all(
      publishedSlugs.map((slug) => buildRegistryItem(registryEntry(slug)))
    );

    expect(items.map(({ name }) => name)).toEqual([...publishedSlugs]);
    for (const item of items) {
      expect(item.files.length).toBeGreaterThan(0);
    }
  });

  test('installs conversation into the disposable registry consumer', () => {
    const verifier = readText('scripts/verify-component-registry.ts');

    expect(verifier).toContain("'conversation'");
    expect(verifier).toContain('src/content/components/conversation.md');
  });

  test('publishes every conversation runtime at a stable library target', async () => {
    const item = await buildRegistryItem(registryEntry('conversation'));

    expect(item.files.map(({ path, target, type }) => ({ path, target, type }))).toEqual([
      {
        path: 'features/content/ui/Conversation.astro',
        target: '@ui/conversation.astro',
        type: 'registry:ui',
      },
      {
        path: 'features/content/conversation.ts',
        target: '@lib/conversation.ts',
        type: 'registry:lib',
      },
      {
        path: 'features/content/client/conversation-fit.ts',
        target: '@lib/conversation-fit.ts',
        type: 'registry:lib',
      },
      {
        path: 'styles/conversation.css',
        target: '@lib/conversation.css',
        type: 'registry:lib',
      },
    ]);
    expect(item.files[0]?.content).toContain("from '@/lib/conversation-fit'");
    expect(item.files.some(({ content }) => content.includes('@/features/'))).toBe(false);
  });

  test('keeps decode text component and engine targets distinct', async () => {
    const item = await buildRegistryItem(registryEntry('decode-text'));

    expect(item.files.map(({ target, type }) => ({ target, type }))).toEqual([
      { target: '@ui/decode-text.tsx', type: 'registry:ui' },
      { target: '@lib/decode-text-engine.ts', type: 'registry:lib' },
    ]);
    expect(item.files[0]?.content).toContain("from '@/lib/decode-text-engine'");
    expect(item.files[0]?.content).not.toContain("from '@/components/ui/decode-text'");
  });

  test('publishes the shared listening track contract', async () => {
    const item = await buildRegistryItem(registryEntry('listening'));

    expect(item.files[0]?.content).toContain("from '@/lib/listening-types'");
    expect(item.files[0]?.content).toContain("from '@/lib/listening-markup'");
    expect(item.files[0]?.content).toContain("from '@/lib/listening-controller'");
    expect(item.files[0]?.content).toContain("import '@/lib/listening.css'");
    expect(item.files[1]?.content).toBe(readText('packages/contracts/src/listening.ts'));
    expect(item.files[3]?.content).not.toContain("from '@/lib/listening/analytics'");
    expect(item.files[3]?.content).toContain('ListeningAnalytics | null => null');
    expect(item.files[6]?.target).toBe('types/musickit.d.ts');
    expect(item.files.map(({ path }) => path)).toEqual([
      'features/home/ui/Listening.astro',
      'lib/listening-types.ts',
      'lib/listening-markup.ts',
      'lib/listening-controller.ts',
      'lib/listening.css',
      'lib/musickit/player.ts',
      'types/musickit.d.ts',
      'assets/apple-logo.svg',
    ]);
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

    expect(item).toMatchObject({
      name: 'mood-wheel',
      type: 'registry:ui',
    });
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
      {
        path: 'features/mood/client/wheel-feedback.ts',
        target: '@lib/wheel-feedback.ts',
        type: 'registry:lib',
      },
      {
        path: 'features/mood/shared/feed-anchor.ts',
        target: '@lib/feed-anchor.ts',
        type: 'registry:lib',
      },
      {
        path: 'lib/page-scroll.ts',
        target: '@lib/page-scroll.ts',
        type: 'registry:lib',
      },
      {
        path: 'features/mood/ui/TimelineWheel.astro',
        target: '@ui/timeline-wheel.astro',
        type: 'registry:ui',
      },
    ]);
    const byTarget = (target: string) =>
      item.files.find((file) => file.target === target)?.content ?? '';

    expect(byTarget('@lib/timeline-wheel.ts')).toContain("from '@/lib/timeline-date-tracker'");
    expect(byTarget('@lib/timeline-wheel.ts')).toContain("from '@/lib/wheel-feedback'");
    expect(byTarget('@lib/timeline-wheel.ts')).toContain("from '@/lib/feed-anchor'");
    expect(byTarget('@ui/timeline-wheel.astro')).toContain("import('@/lib/timeline-wheel')");
    expect(byTarget('@ui/timeline-wheel.astro')).toContain('data-timeline-wheel');
    expect(item.files.some(({ content }) => content.includes('@/features/'))).toBe(false);
  });

  test('honors reduced motion in detail table of contents navigation', () => {
    const onThisPage = readText('src/features/components/ui/OnThisPage.astro');

    expect(onThisPage).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
    expect(onThisPage).toContain("behavior: reducedMotion.matches ? 'auto' : 'smooth'");
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
