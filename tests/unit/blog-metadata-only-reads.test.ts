import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

// These callers read only slugs, tags and locale tags. Asking for the 'web'
// output target would run the full rich-content render (directives, embed
// metadata fetches) over every post, once per tag page at build.
const METADATA_ONLY_CALLERS = [
  '../../src/pages/blog/tag/[slug].astro',
  '../../src/pages/blog/index.astro',
  '../../scripts/generate-i18n-manifest.ts',
  '../../src/features/posts/server/i18n-manifest.ts',
];

describe('metadata-only post reads', () => {
  for (const path of METADATA_ONLY_CALLERS) {
    test(`${path.replace('../../', '')} skips the rich-content render`, () => {
      const source = readFileSync(new URL(path, import.meta.url), 'utf8');

      expect(source).toContain('getAccessiblePosts()');
      expect(source).not.toContain('getAccessiblePosts({ outputTarget');
    });
  }
});
