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

  test('pauses ambient homepage animation while inactive', () => {
    const contributions = readText('src/features/home/ui/GitHubContributions.astro');
    const projectStack = readText('src/components/project-cards/ProjectStack.tsx');
    const harmonicWave = readText('src/components/project-cards/HarmonicWaveHero.tsx');
    const cliCube = readText('src/components/project-cards/CliCubeHero.tsx');

    expect(contributions).toContain('data-contribution-section');
    expect(contributions).toContain("document.addEventListener('visibilitychange'");
    expect(contributions).toContain('.activity-section.is-breathing-active .wave-bar');
    expect(contributions).not.toContain('.activity-section.is-breathing .wave-bar');
    expect(projectStack).toContain('const stackActive = inViewport && documentVisible;');
    expect(projectStack).toContain('!stackActive ||');
    expect(projectStack).toContain('active={active}');
    expect(projectStack).toContain('heroActive={stackActive && active}');
    expect(harmonicWave).toContain('className={live ? `wave-scroll wave-${i}` : undefined}');
    expect(cliCube).toContain('if (!live) return;');
    expect(cliCube).toContain('className={live ? "cli-cube-float" : undefined}');
  });

  test('keeps JetBrains Mono off the homepage critical path', () => {
    const homePage = readText('src/pages/index.astro');
    const homeHero = readText('src/features/home/ui/Hero.astro');
    const layout = readText('src/layouts/Layout.astro');
    const globals = readText('src/styles/globals.css');
    const fonts = readText('src/lib/fonts.ts');

    expect(homePage).toContain('--font-code: var(--font-mono);');
    expect(homeHero).not.toContain('font-code');
    // The default preload set is the two faces every page paints. 'code' is not
    // one of them, so the homepage never pulls JetBrains Mono in.
    expect(layout).toContain("preloadFont = ['mono', 'sans']");
    expect(homePage).not.toContain('preloadFont');
    expect(fonts).toContain("mono: '/fonts/geist-mono-variable.woff2'");
    expect(layout).not.toContain('jetbrains-mono-variable.woff2');
    expect(globals).toContain("--font-code: 'JetBrains Mono'");
  });
});
