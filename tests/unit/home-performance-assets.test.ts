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
