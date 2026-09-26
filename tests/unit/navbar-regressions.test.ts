import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const read = (filePath: string): string => readFileSync(path.join(repoRoot, filePath), 'utf8');

describe('navbar regression guards', () => {
  test('layout compensates fixed mobile chrome for visual viewport movement', () => {
    const layoutSource = read('src/layouts/Layout.astro');
    const viewportSource = read('src/layouts/client/visual-viewport.ts');
    const chromeStyles = read('src/styles/site-chrome.css');
    const pageStyles = read('src/layouts/Page.astro');

    expect(layoutSource).toContain("import('@/layouts/client/visual-viewport')");
    expect(viewportSource).toContain('const viewport = window.visualViewport;');
    expect(viewportSource).toContain('let bottomOverscrollLocked = false;');
    expect(viewportSource).toContain('const bottomOverscrollReleaseDistance = 96;');
    expect(viewportSource).toContain('const offsetTop = isBottomOverscrollOffset(rawOffsetTop) ? 0 : Math.round(rawOffsetTop);');
    expect(viewportSource).toContain("window.addEventListener('scroll', requestSync");
    expect(viewportSource).toContain("root.style.setProperty('--visual-viewport-top'");
    expect(chromeStyles).toContain('--site-nav-mobile-top: calc(env(safe-area-inset-top, 0px) + var(--visual-viewport-top, 0px));');
    expect(chromeStyles).toContain('top: var(--site-nav-mobile-top);');
    expect(chromeStyles).toContain('top: calc(env(safe-area-inset-top, 0px) + var(--visual-viewport-top, 0px) + 0.3rem);');
    expect(pageStyles).toContain('top: var(--site-nav-mobile-top);');
  });

  test('Mood client code reads scroll from pageScroll(), never window', () => {
    // Mood scrolls a contained element, so window.scrollY is always 0 there.
    const moodClients = [
      'src/features/mood/ui/MoodNavbar.astro',
      'src/features/mood/client/feed-controller.ts',
      'src/features/mood/client/feed-update-watcher.ts',
      'src/features/mood/client/timeline-wheel.ts',
    ].map(read).join('\n');

    expect(moodClients).toContain('pageScroll()');
    expect(moodClients).not.toContain('window.scrollY');
  });
});
