import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(import.meta.dir, '../..');

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, path), 'utf8')) as Record<string, unknown>;
}

function readText(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

function listSourceFiles(dir: string): string[] {
  return readdirSync(join(root, dir), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(astro|[cm]?[jt]sx?)$/.test(entry.name))
    .map((entry) => relative(root, join(entry.parentPath, entry.name)));
}

describe('Cloudflare runtime configuration', () => {
  // A prerendered /dev page served by the asset layer would skip the
  // middleware's admin gate, so these prefixes must reach the Worker first.
  test('routes /dev, /oauth, /v2 and /api through the Worker before static assets', () => {
    const config = readJson('wrangler.jsonc') as {
      assets?: { run_worker_first?: string[] };
      services?: Array<{ binding?: string; service?: string }>;
    };

    expect(config.assets?.run_worker_first).toEqual(
      expect.arrayContaining(['/dev', '/dev/*', '/oauth*', '/v2/*', '/api/*']),
    );
    expect(config.services).toContainEqual({ binding: 'API', service: 'site-api' });
  });

  // import.meta.env values are inlined at build time: a Ghost secret would be
  // bundled into the Worker, and a Turnstile key could not follow the
  // runtime environment. Neither failure is observable in a unit test.
  test('server code never reads Ghost or Turnstile keys through import.meta.env', () => {
    const pattern = /import\.meta\.env(?:\.|\[['"])(?:GHOST_|PUBLIC_TURNSTILE_SITE_KEY)/;
    const offenders = listSourceFiles('src').filter((path) => pattern.test(readText(path)));

    expect(offenders).toEqual([]);
  });

  // gsap is ~70 KB; the mood feed loads it on the first animation, never with the page.
  test('mood client code imports gsap only dynamically', () => {
    const staticImport = /^import\s+(?!type\b)[^;]*from\s+['"]gsap['"]/m;
    const offenders = listSourceFiles('src/features/mood').filter((path) => staticImport.test(readText(path)));

    expect(offenders).toEqual([]);
  });
});
