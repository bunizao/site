import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '../..');

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, path), 'utf8')) as Record<string, unknown>;
}

function readText(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

describe('Cloudflare runtime configuration', () => {
  test('uses the Cloudflare Astro adapter and root Wrangler scripts', () => {
    const packageJson = readJson('package.json') as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const allDependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };
    const astroConfig = readText('astro.config.mjs');

    expect(allDependencies['@astrojs/cloudflare']).toBeString();
    expect(allDependencies.wrangler).toBeString();
    expect(allDependencies['@astrojs/vercel']).toBeUndefined();
    expect(allDependencies['@vercel/analytics']).toBeUndefined();
    expect(allDependencies['@vercel/speed-insights']).toBeUndefined();
    expect(astroConfig).toContain("from '@astrojs/cloudflare'");
    expect(astroConfig).toContain("imageService: 'passthrough'");
    expect(astroConfig).toContain("prerenderEnvironment: 'node'");
    expect(astroConfig).not.toContain("from '@astrojs/vercel'");
    expect(packageJson.scripts?.['deploy:cloudflare']).toBe('bun run build && wrangler deploy --config dist/server/wrangler.json');
    expect(packageJson.scripts?.['preview:cloudflare']).toBe('bun run build && wrangler dev --config dist/server/wrangler.json');
    expect(packageJson.scripts?.['tail:cloudflare']).toBe('wrangler tail');
    expect(packageJson.scripts?.['types:cloudflare']).toBe('wrangler types');
    expect(packageJson.scripts?.check).toBe('astro check');
    expect(packageJson.scripts?.build).toBe('astro build');
    expect(packageJson.scripts?.dev).toContain('astro dev');
    expect(packageJson.scripts?.dev).not.toContain('bunx --bun');
  });

  test('defines a primary Worker with static assets and dynamic route interception', () => {
    const config = readJson('wrangler.jsonc') as {
      name?: string;
      main?: string;
      assets?: {
        directory?: string;
        binding?: string;
        run_worker_first?: string[];
      };
      routes?: Array<{ pattern?: string; custom_domain?: boolean }>;
      triggers?: { crons?: string[] };
    };

    expect(config.name).toBe('buxx-site');
    expect(config.main).toBe('@astrojs/cloudflare/entrypoints/server');
    expect(config.assets?.directory).toBe('./dist');
    expect(config.assets?.binding).toBe('ASSETS');
    expect(config.assets?.run_worker_first).toEqual([
      '/api/*',
      '/mood*',
      '/dev/*',
      '/oauth*',
      '/docs*',
    ]);
    expect(config.routes).toContainEqual({ pattern: 'buxx.me', custom_domain: true });
    expect(config.routes).toContainEqual({ pattern: 'www.buxx.me', custom_domain: true });
    expect(config.routes).toContainEqual({ pattern: 'image.buxx.me', custom_domain: true });
    expect(config.triggers?.crons).toContain('0 3 * * *');
  });
});
