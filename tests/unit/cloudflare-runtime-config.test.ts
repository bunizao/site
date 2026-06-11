import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '../..');

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, path), 'utf8')) as Record<string, unknown>;
}

function readText(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

describe('Cloudflare runtime configuration', () => {
  test('does not keep Vercel deployment configuration', () => {
    expect(existsSync(join(root, 'vercel.json'))).toBe(false);
  });

  test('does not keep legacy host deployment configuration', () => {
    expect(existsSync(join(root, 'netlify.toml'))).toBe(false);
  });

  test('keeps preview and Lighthouse checks platform-neutral', () => {
    const files = [
      '.github/workflows/preview-smoke.yml',
      '.github/workflows/lighthouse.yml',
      '.github/scripts/redact-lighthouse-artifacts.mjs',
      'lighthouserc.cjs',
      'playwright.config.ts',
    ];
    const configText = files.map(readText).join('\n');

    expect(configText).not.toContain('VERCEL_AUTOMATION_BYPASS_SECRET');
    expect(configText).not.toContain('E2E_VERCEL_BYPASS_SECRET');
    expect(configText).not.toContain('x-vercel-protection-bypass');
    expect(configText).not.toContain('x-vercel-set-bypass-cookie');
    expect(configText).not.toContain('bunx --bun astro dev');
    expect(configText).toContain('command: `node_modules/.bin/astro dev --host ${host} --port ${port}`');
    expect(configText).toContain('Cloudflare preview URL to test');
    expect(configText).toContain('Cloudflare deployment URL to audit');
  });

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
      placement?: {
        mode?: string;
      };
      assets?: {
        directory?: string;
        binding?: string;
        run_worker_first?: string[];
      };
      routes?: Array<{ pattern?: string; zone_name?: string; custom_domain?: boolean }>;
      triggers?: { crons?: string[] };
      vars?: Record<string, string>;
    };

    expect(config.name).toBe('site');
    expect(config.main).toBe('src/worker.ts');
    expect(config.placement?.mode).toBe('smart');
    expect(config.assets?.directory).toBe('./dist');
    expect(config.assets?.binding).toBe('ASSETS');
    expect(config.assets?.run_worker_first).toEqual([
      '/api/*',
      '/mood*',
      '/channel/avatar',
      '/ingest/*',
      '/webhook',
      '/dev/*',
      '/oauth*',
      '/docs*',
    ]);
    expect(config.routes).toContainEqual({ pattern: 'buxx.me', zone_name: 'buxx.me', custom_domain: true });
    expect(config.routes).toContainEqual({ pattern: 'www.buxx.me', zone_name: 'buxx.me', custom_domain: true });
    expect(config.routes).toContainEqual({
      pattern: 'cf-migration.buxx.me',
      zone_name: 'buxx.me',
      custom_domain: true,
    });
    expect(config.routes).toContainEqual({ pattern: 'image.buxx.me', zone_name: 'buxx.me', custom_domain: true });
    expect(config.vars).toMatchObject({
      SITE_URL: 'https://buxx.me',
      PUBLIC_SITE_URL: 'https://buxx.me',
      NOTIFY_BASE_URL: 'https://buxx.me',
      NOTIFY_DISPATCH_URL: 'https://buxx.me/api/notify/dispatch',
      GHOST_URL: 'https://blog.buxx.me',
      LASTFM_USER: 'bunizao',
      PUBLIC_HD_IMAGE_URL: 'https://image.buxx.me',
      PUBLIC_TURNSTILE_SITE_KEY: '0x4AAAAAACaDQzCbYalmO_xV',
      HD_IMAGE_INGEST_BASE_URL: 'https://image.buxx.me',
      CHANNEL: 'tutumood',
      TELEGRAM_HOST: 't.me',
      ADMIN_GITHUB_LOGIN: 'bunizao',
      CLOUDFLARE_ACCOUNT_ID: '545faed61bc6b0c8ef2c417303555d6f',
      CLOUDFLARE_NOTIFY_D1_DATABASE_ID: 'bf8cd2f1-29c7-44c1-b9bb-555265dd40b3',
    });
    expect(config.triggers?.crons).toContain('*/15 * * * *');
  });

  test('reads Turnstile site key from runtime public env on the mood route', () => {
    const moodRoute = readText('src/pages/mood.astro');

    expect(moodRoute).toContain("readPublicEnv(Astro.locals, 'TURNSTILE_SITE_KEY')");
    expect(moodRoute).not.toContain('import.meta.env.PUBLIC_TURNSTILE_SITE_KEY');
  });

  test('documents Ghost publishing through Cloudflare deploy hooks', () => {
    const docsText = [
      'docs/HOME.md',
      'docs/WORKER-SITE.md',
      'src/content/docs/docs/surfaces/home.md',
      'src/content/docs/docs/infra/worker-site.md',
    ].map(readText).join('\n');

    expect(docsText).toContain('Cloudflare Workers Builds deploy hook');
    expect(docsText).toContain('GHOST_CONTENT_APIKEY');
    expect(docsText).toContain('Cloudflare build environment');
    expect(docsText).toContain('Post published');
    expect(docsText).not.toContain(['https://api.vercel.com', 'v1/integrations/deploy'].join('/'));
  });
});
