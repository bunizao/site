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
  test("blurred OG backdrops stay under 5% of the sharp card's bytes", () => {
    const blurAssets = [
      ['public/projects/ogis/og-2.webp', 'public/projects/ogis/og-2-blur.webp'],
      ['public/projects/ogis/og-4.webp', 'public/projects/ogis/og-4-blur.webp'],
    ] as const;

    for (const [source, blur] of blurAssets) {
      expect(existsSync(join(root, blur))).toBe(true);
      expect(sizeOf(blur)).toBeLessThan(sizeOf(source) * 0.05);
    }
  });

  test('loads project hero images eagerly only on the above-the-fold /projects panel', () => {
    const ogCarousel = readText('src/components/project-cards/OgCarouselHero.tsx');
    const attegiTour = readText('src/components/project-cards/AttegiTourHero.tsx');
    const showcase = readText('src/components/project-cards/ProjectShowcaseCard.tsx');
    const heroPanel = readText('src/components/project-cards/HeroPanel.tsx');
    const projectStack = readText('src/components/project-cards/ProjectStack.tsx');
    const projectsPage = readText('src/pages/projects.astro');

    for (const hero of [ogCarousel, attegiTour]) {
      expect(hero).toContain('priority = false,');
      expect(hero).toContain('({ loading: "lazy", fetchPriority: "low" } as const)');
      expect(hero).toContain('{...imageLoading(priority, ');
      expect(hero).not.toContain('loading={eager ? "eager" : "lazy"}');
      expect(hero).not.toContain('loading={active === 0 ? "eager" : "lazy"}');
    }
    expect(showcase).toContain('export function renderHero(hero: ProjectHero, hovered: boolean, priority = false)');
    expect(heroPanel).toContain('renderHero(hero, live, priority)');
    // The home deck sits below the fold and never passes priority.
    expect(projectStack).not.toContain('priority');
    expect(projectsPage).toContain('<HeroPanel client:load hero={project.hero} accent={project.accent} priority />');
    expect(projectsPage).toContain('<HeroPanel client:visible hero={project.hero} accent={project.accent} />');
  });

  test('project card heroes loop only while the deck is live and the card is on top', () => {
    const projectStack = readText('src/components/project-cards/ProjectStack.tsx');
    const harmonicWave = readText('src/components/project-cards/HarmonicWaveHero.tsx');
    const cliCube = readText('src/components/project-cards/CliCubeHero.tsx');

    expect(projectStack).toContain('heroActive={stackActive && active}');
    expect(harmonicWave).toContain('className={live ? `wave-scroll wave-${i}` : undefined}');
    expect(cliCube).toContain('if (!live) return;');
    expect(cliCube).toContain('className={live ? "cli-cube-float" : undefined}');
  });
});
