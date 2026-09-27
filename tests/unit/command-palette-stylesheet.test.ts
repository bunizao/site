import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

function readSource(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

describe('command palette stylesheet', () => {
  test('stays off the critical path of every page', () => {
    const palette = readSource('src/components/CommandPalette.astro');

    // Any <style> block or static/script-side CSS import is hoisted into
    // <head> as render-blocking; only a frontmatter dynamic ?url import is not.
    expect(palette).not.toContain('<style');
    expect(palette).toContain("(await import('@/styles/command-palette.css?url')).default");
    expect(palette).toContain('data-stylesheet={stylesheetHref}');
    expect(palette).not.toMatch(/^\s*import\s+['"][^'"]+\.css['"]/m);
  });

  test('an open that beats the download waits for it', () => {
    const palette = readSource('src/components/CommandPalette.astro');

    expect(palette).toMatch(/const open = \(\) => \{\s*if \(dialog\.open\) return;\s*if \(!stylesheetLoaded\) \{\s*void stylesheet\.then\(open\);/);
  });

  test('keeps every rule scoped to the palette', () => {
    const css = readSource('src/styles/command-palette.css').replace(/\/\*[\s\S]*?\*\//g, '');
    // Every "prelude {" in the file, nested ones included.
    const selectors = Array.from(css.matchAll(/([^{}]+)\{/g), (match) => match[1].trim())
      .filter((selector) => !selector.startsWith('@') && !/^(?:from|to|\d+%)$/.test(selector));

    for (const selector of selectors.flatMap((group) => group.split(','))) {
      expect(selector.trim()).toMatch(/^(?:\.dark\s+)?\.cmdk/);
    }
  });
});
