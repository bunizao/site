import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '../..');

function readText(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

function sizeOf(path: string): number {
  return statSync(join(root, path)).size;
}

describe('homepage performance assets', () => {
  test('uses lightweight OG carousel assets for blurred backgrounds', () => {
    const carousel = readText('src/components/project-cards/OgCarouselHero.tsx');
    const blurAssets = [
      ['public/projects/ogis/og-2.webp', 'public/projects/ogis/og-2-blur.webp'],
      ['public/projects/ogis/og-4.webp', 'public/projects/ogis/og-4-blur.webp'],
    ] as const;

    expect(carousel).toContain('blurSrc: "/projects/ogis/og-2-blur.webp"');
    expect(carousel).toContain('blurSrc: "/projects/ogis/og-4-blur.webp"');
    expect(carousel).toContain('const backgroundSrc = slide.blurSrc ?? slide.src;');
    expect(carousel).toContain('src={backgroundSrc}');

    for (const [source, blur] of blurAssets) {
      expect(existsSync(join(root, blur))).toBe(true);
      expect(sizeOf(blur)).toBeLessThan(sizeOf(source) * 0.05);
    }
  });

  test('bounds carousel image rendering to keyed presence', () => {
    const ogCarousel = readText('src/components/project-cards/OgCarouselHero.tsx');
    const attegiTour = readText('src/components/project-cards/AttegiTourHero.tsx');

    expect(ogCarousel).toContain('<AnimatePresence initial={false}>');
    expect(ogCarousel).toContain('key={slide.src}');
    expect(ogCarousel).not.toContain('slides.map(');
    expect(attegiTour).toContain('<AnimatePresence initial={false}>');
    expect(attegiTour).toContain('key={slide.src}');
    expect(attegiTour).not.toContain('slides.map(');
  });

  test('releases homepage compositor hints when effects are idle', () => {
    const layout = readText('src/layouts/Layout.astro');
    const globals = readText('src/styles/globals.css');
    const parallax = readText('src/features/home/ui/ParallaxWrapper.astro');

    expect(layout).toContain("overlay.classList.add('is-active')");
    expect(layout).toContain("overlay.classList.remove('is-active')");
    expect(globals).toContain('.spotlight-overlay.is-active {');
    expect(globals).toContain(
      '.spotlight-overlay.is-active .spotlight-overlay__grid {',
    );

    const spotlightBase = globals.slice(
      globals.indexOf('.spotlight-overlay {'),
      globals.indexOf('.spotlight-overlay.is-active {'),
    );
    expect(spotlightBase).not.toContain('translateZ(0)');
    expect(spotlightBase).not.toContain('will-change');
    expect(parallax).not.toContain(':global(section) {');
  });

  test('keeps JetBrains Mono off the homepage critical path', () => {
    const homePage = readText('src/pages/index.astro');
    const homeHero = readText('src/features/home/ui/Hero.astro');
    const layout = readText('src/layouts/Layout.astro');
    const globals = readText('src/styles/globals.css');

    expect(homePage).toContain('--font-code: var(--font-mono);');
    expect(homeHero).not.toContain('font-code');
    expect(layout).toContain("preloadFont = 'mono'");
    expect(layout).toContain(": '/fonts/geist-mono-variable.woff2'");
    expect(layout).not.toContain('href="/fonts/jetbrains-mono-variable.woff2"');
    expect(globals).toContain("--font-code: 'JetBrains Mono'");
  });
});
