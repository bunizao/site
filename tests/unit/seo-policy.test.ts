import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

function readSource(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

describe('search indexing policy', () => {
  test('indexes the mood hub without indexing the unbounded detail archive', () => {
    const feed = readSource('src/pages/mood.astro');
    const detail = readSource('src/pages/mood/[id].astro');

    expect(feed).not.toContain('robots="noindex');
    expect(detail).toContain('robots="noindex, follow"');
  });

  test('keeps blog article title signals branded and structured', () => {
    const layout = readSource('src/layouts/BlogLayout.astro');

    expect(layout).toContain('`${pageTitle} — ${blog.name}`');
    expect(layout).toContain('<title>{fullTitle}</title>');
    expect(layout).toContain("'@type': 'BlogPosting'");
    expect(layout).toContain("name: blog.name");
    expect(layout).toContain('url: new URL(BLOG_FAVICON, meta.siteUrl).href');
  });
});
