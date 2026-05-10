import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const read = (filePath: string): string => readFileSync(path.join(repoRoot, filePath), 'utf8');

describe('navbar regression guards', () => {
  test('layout preloads the mono font and supports home-style header actions', () => {
    const source = read('src/layouts/Layout.astro');

    expect(source).toContain("headerActionsVariant?: 'default' | 'home'");
    expect(source).toContain("const useHomeHeaderActions = isHomeNav || headerActionsVariant === 'home';");
    expect(source).toContain("rel=\"preload\"");
    expect(source).toContain("/fonts/jetbrains-mono-variable.woff2");
    expect(source).toContain("'global-header-actions--home': useHomeHeaderActions");
  });

  test('home hero spacing stays tied to safe-area and small viewport height', () => {
    const source = read('src/features/home/ui/Hero.astro');

    expect(source).toContain('min-height: calc(100svh - 120px);');
    expect(source).toContain('padding-top: calc(env(safe-area-inset-top, 0px) + 4.75rem);');
  });

  test('mobile navbar keeps Safari safe-area offset and releases brand space when collapsed', () => {
    const source = read('src/styles/globals.css');

    expect(source).toContain('.site-nav--home {');
    expect(source).toContain('top: calc(env(safe-area-inset-top, 0px) + var(--visual-viewport-top, 0px));');
    expect(source).toContain('.site-nav--home::before');
    expect(source).toContain('height: env(safe-area-inset-top, 0px);');
    expect(source).toContain(".site-nav--home.is-brand-eaten .site-brand {");
    expect(source).toContain('min-width: 40px;');
    expect(source).toContain('.site-nav--home.is-brand-eaten .site-brand-text {');
    expect(source).toContain('flex-basis: 0;');
  });

  test('layout compensates fixed mobile chrome for visual viewport movement', () => {
    const layoutSource = read('src/layouts/Layout.astro');
    const globalStyles = read('src/styles/globals.css');
    const pageStyles = read('src/layouts/Page.astro');

    expect(layoutSource).toContain('const viewport = window.visualViewport;');
    expect(layoutSource).toContain("root.style.setProperty('--visual-viewport-top'");
    expect(globalStyles).toContain('top: calc(env(safe-area-inset-top, 0px) + var(--visual-viewport-top, 0px));');
    expect(globalStyles).toContain('top: calc(env(safe-area-inset-top, 0px) + var(--visual-viewport-top, 0px) + 0.3rem);');
    expect(pageStyles).toContain('top: calc(env(safe-area-inset-top, 0px) + var(--visual-viewport-top, 0px));');
  });
});
