import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const read = (filePath: string): string => readFileSync(path.join(repoRoot, filePath), 'utf8');

describe('navbar regression guards', () => {
  test('layout preloads the site mono font and supports home-style header actions', () => {
    const source = read('src/layouts/Layout.astro');

    expect(source).toContain("headerActionsVariant?: 'default' | 'home'");
    expect(source).toContain("const useHomeHeaderActions = isHomeNav || headerActionsVariant === 'home';");
    expect(source).toContain("rel=\"preload\"");
    // Body faces are never preloaded — Chrome holds first paint until every
    // preloaded font arrives. The wordmark (2.6KB, font-display: block) is the
    // one exception, on the home nav.
    expect(source).not.toContain('preloadFont');
    expect(source).toContain('wenkai-wordmark.woff2');
    expect(source).toContain("'global-header-actions--home': useHomeHeaderActions");
  });

  test('layout emits a site logo Open Graph tag', () => {
    const source = read('src/layouts/Layout.astro');

    expect(source).toContain("const ogLogoUrl = new URL('/logo/peek.svg?v=3', site).href;");
    expect(source).toContain('<meta property="og:logo" content={ogLogoUrl} />');
  });

  test('home hero spacing stays tied to safe-area and small viewport height', () => {
    const source = read('src/features/home/ui/Hero.astro');
    const field = read('src/features/home/ui/GlyphField.astro');

    expect(source).toContain('min-height: calc(100svh - 120px);');
    expect(source).toContain('padding-top: calc(env(safe-area-inset-top, 0px) + 4.75rem);');
    // The phone band is gone where the bio starts; the copy does not move.
    expect(field).toContain('--band-h: 320px;');
    expect(field).toContain('linear-gradient(to bottom, #000 45%, transparent 76%)');
  });

  test('mobile navbar keeps Safari safe-area offset and exposes the menu sheet', () => {
    const layoutSource = read('src/layouts/Layout.astro');
    const chromeStyles = read('src/styles/site-chrome.css');

    expect(chromeStyles).toContain('.site-nav--home {');
    expect(chromeStyles).toContain('--site-nav-mobile-top: calc(env(safe-area-inset-top, 0px) + var(--visual-viewport-top, 0px));');
    expect(chromeStyles).toContain('top: var(--site-nav-mobile-top);');
    expect(chromeStyles).toContain('.site-nav--home::before');
    expect(chromeStyles).toContain('height: env(safe-area-inset-top, 0px);');
    expect(chromeStyles).toContain('.site-nav .nav-links {\n      display: none;\n    }');
    expect(layoutSource).toContain('id="site-menu-sheet"');
    expect(layoutSource).toContain('role="dialog"');
    expect(layoutSource).toContain('aria-modal="true"');
    expect(layoutSource).toContain('aria-controls="site-menu-sheet"');
  });

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

  test('home and page navbars share brand chrome tokens', () => {
    const chromeStyles = read('src/styles/site-chrome.css');
    const pageStyles = read('src/layouts/Page.astro');
    const brandStyles = read('src/styles/brand.css');

    expect(chromeStyles).toContain('--site-nav-brand-gap: 0.375rem;');
    expect(chromeStyles).toContain('--site-nav-mobile-height: 3.25rem;');
    expect(chromeStyles).toContain('--site-nav-mobile-padding: 0 4rem 0 1rem;');
    expect(chromeStyles).toContain('--site-nav-mobile-logo-height: 14px;');
    expect(chromeStyles).toContain('--site-nav-mobile-wordmark-width: 5.6rem;');
    expect(brandStyles).toContain('.site-brand-row {');
    expect(brandStyles).toContain('--brand-logo-height');
    expect(pageStyles).toContain('height: var(--site-nav-mobile-height);');
    expect(pageStyles).toContain('padding: var(--site-nav-mobile-padding);');
    expect(pageStyles).toContain('--brand-logo-height: var(--site-nav-mobile-logo-height);');
    expect(pageStyles).toContain('width: var(--site-nav-mobile-wordmark-width);');
  });

  test('blog and Mood share the contained page scroll contract', () => {
    const pageScroller = read('src/components/PageScroller.astro');
    const pageScrollerStyles = read('src/styles/page-scroller.css');
    const pageScroll = read('src/lib/page-scroll.ts');
    const layout = read('src/layouts/Layout.astro');
    const blogLayout = read('src/layouts/BlogLayout.astro');
    const moodPage = read('src/pages/mood.astro');
    const moodClients = [
      'src/features/mood/ui/MoodNavbar.astro',
      'src/features/mood/client/feed-controller.ts',
      'src/features/mood/client/feed-update-watcher.ts',
      'src/features/mood/client/timeline-wheel.ts',
    ].map(read).join('\n');

    expect(pageScroller).toContain('data-page-scroller');
    expect(pageScrollerStyles).toContain('scroll-timeline-name: --page-scroll;');
    expect(pageScrollerStyles).toContain('html.page-scroll-root');
    expect(pageScroll).toContain("timeline: CONTAINED_TIMELINE");
    expect(layout).toContain("'page-scroll-root': containedScroll");
    expect(blogLayout).toContain('<PageScroller class="blog-scroller" restorationKey="blog-scroll">');
    expect(moodPage).toContain('containedScroll');
    expect(moodClients).toContain('pageScroll()');
    expect(moodClients).not.toContain('window.scrollY');
  });
});
