import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

// Source-level guards for what /blog puts in front of its first paint. The lab
// tools disagree on small deltas here, so the rules are pinned by mechanism.
function readSource(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

describe('blog critical path', () => {
  test('the layout preloads no body font, and the wordmark only on request', () => {
    const layout = readSource('src/layouts/BlogLayout.astro');

    // Chrome holds first paint for a preloaded font still in flight, and
    // Inter's 48KB competes with the stylesheets for the first round trips.
    expect(layout).not.toContain('inter-variable.woff2');
    expect(layout.match(/as="font"/g)?.length).toBe(1);
    expect(layout).toMatch(/\{preloadWordmark && \(\s*<link\s+rel="preload"\s+href="\/fonts\/wenkai-wordmark\.woff2"/);
  });

  test('only the page that paints the masthead lockup preloads its font', () => {
    const index = readSource('src/pages/blog/index.astro');
    const post = readSource('src/pages/blog/[...slug].astro');

    expect(index).toContain('<BlogMasthead />');
    expect(index).toMatch(/<BlogLayout[^>]*\bpreloadWordmark\b/);
    expect(post).not.toContain('preloadWordmark');
  });

  test('YouTube embed styles ship with post content, not with every blog page', () => {
    const layout = readSource('src/layouts/BlogLayout.astro');
    const prose = readSource('src/features/posts/ui/Prose.astro');

    expect(layout).not.toContain('embed-youtube.css');
    expect(prose).toContain("import '../../../styles/embed-youtube.css';");
  });
});
