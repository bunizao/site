import { describe, expect, test } from 'bun:test';

import { computeDraftReadiness } from '@/features/posts/server/draft-readiness';
import type { GhostAdminPostTag } from '@/features/posts/server/ghost-admin';

function knownSlugs(...slugs: string[]): () => Promise<ReadonlySet<string>> {
  return async () => new Set(slugs);
}

describe('computeDraftReadiness', () => {
  test('reports no translation, no markers, and every tag name for a plain post', async () => {
    const tags: GhostAdminPostTag[] = [
      { name: 'Craft', slug: 'craft', visibility: 'public' },
    ];

    const readiness = await computeDraftReadiness(tags, 'plain-post', knownSlugs());

    expect(readiness).toEqual({
      translation: null,
      unlisted: false,
      noToc: false,
      notByAi: false,
      tags: ['Craft'],
    });
  });

  test('reads the translation grammar through i18n.ts and checks the canonical exists', async () => {
    const tags: GhostAdminPostTag[] = [
      { name: '#en:lun-chenmo', slug: 'en-lun-chenmo', visibility: 'internal' },
    ];

    const withCanonical = await computeDraftReadiness(
      tags,
      'lun-chenmo-en',
      knownSlugs('lun-chenmo', 'other-post'),
    );
    expect(withCanonical.translation).toEqual({
      locale: 'en',
      canonical: 'lun-chenmo',
      canonicalExists: true,
    });

    const withoutCanonical = await computeDraftReadiness(
      tags,
      'lun-chenmo-en',
      knownSlugs('other-post'),
    );
    expect(withoutCanonical.translation).toEqual({
      locale: 'en',
      canonical: 'lun-chenmo',
      canonicalExists: false,
    });
  });

  test('never resolves known slugs for a post with no translation tag', async () => {
    let called = false;
    const readiness = await computeDraftReadiness(
      [],
      'plain-post',
      async () => {
        called = true;
        return new Set<string>();
      },
    );

    expect(readiness.translation).toBeNull();
    expect(called).toBe(false);
  });

  test('reads unlisted, no-toc and not-by-ai off their own tags', async () => {
    const tags: GhostAdminPostTag[] = [
      { name: '#unlisted', slug: 'hash-unlisted', visibility: 'internal' },
      { name: '#no-toc', slug: 'hash-no-toc', visibility: 'internal' },
      { name: '#not-by-ai', slug: 'hash-not-by-ai', visibility: 'internal' },
    ];

    const readiness = await computeDraftReadiness(tags, 'marked-post', knownSlugs());

    expect(readiness.unlisted).toBe(true);
    expect(readiness.noToc).toBe(true);
    expect(readiness.notByAi).toBe(true);
    expect(readiness.tags).toEqual(['#unlisted', '#no-toc', '#not-by-ai']);
  });
});
