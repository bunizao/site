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
      'config/lighthouse.cjs',
      'playwright.config.ts',
    ];
    const configText = files.map(readText).join('\n');

    expect(configText).not.toContain('VERCEL_AUTOMATION_BYPASS_SECRET');
    expect(configText).not.toContain('E2E_VERCEL_BYPASS_SECRET');
    expect(configText).not.toContain('x-vercel-protection-bypass');
    expect(configText).not.toContain('x-vercel-set-bypass-cookie');
    expect(configText).not.toContain('bunx --bun astro dev');
    expect(configText).toContain('command: `node_modules/.bin/astro dev --host ${host} --port ${port}`');
    expect(configText).toContain('Remote URL to test; omit to run against the local checked-out build');
    expect(configText).toContain('URL to audit; defaults to the production Worker');
  });

  test('runs preview smoke without Vercel deployment events', () => {
    const previewWorkflow = readText('.github/workflows/preview-smoke.yml');

    expect(previewWorkflow).toContain('pull_request:');
    expect(previewWorkflow).toContain('workflow_dispatch:');
    expect(previewWorkflow).toContain('node-version-file: .node-version');
    expect(previewWorkflow).toContain('Configure Cloudflare Access preview');
    expect(previewWorkflow).toContain('configure-cloudflare-access-preview.mjs');
    expect(previewWorkflow).toContain('wrangler versions upload');
    expect(previewWorkflow).toContain('--preview-alias "$PREVIEW_ALIAS"');
    expect(previewWorkflow).toContain(
      'E2E_BASE_URL: ${{ steps.context.outputs.preview_url || steps.cloudflare-preview.outputs.preview_url }}'
    );
    expect(previewWorkflow).toContain('local checked-out build');
    expect(previewWorkflow).not.toContain('deployment_status:');
    expect(previewWorkflow).not.toContain('github.event.deployment');
    expect(previewWorkflow).not.toContain('should_run');
  });

  test('runs Lighthouse without Vercel deployment events', () => {
    const lighthouseWorkflow = readText('.github/workflows/lighthouse.yml');

    expect(lighthouseWorkflow).toContain('push:');
    expect(lighthouseWorkflow).toContain('schedule:');
    expect(lighthouseWorkflow).toContain('workflow_dispatch:');
    expect(lighthouseWorkflow).toContain("inputUrl || 'https://buxx.me'");
    expect(lighthouseWorkflow).toContain('Wait for Cloudflare production deploy');
    expect(lighthouseWorkflow).toContain('node-version-file: .node-version');
    expect(lighthouseWorkflow).toContain('branches: [main]');
    expect(lighthouseWorkflow).not.toContain('deployment_status:');
    expect(lighthouseWorkflow).not.toContain('github.event.deployment');
  });

  test('runs ops health against the current Telegram webhook route', () => {
    const opsWorkflow = readText('.github/workflows/ops-health.yml');

    expect(opsWorkflow).toContain('TELEGRAM_EXPECTED_WEBHOOK_URL: https://api.buxx.me/v2/telegram/webhook');
    expect(opsWorkflow).not.toContain('TELEGRAM_EXPECTED_WEBHOOK_URL: https://image.buxx.me/webhook');
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
    expect(packageJson.scripts?.preview).toBe('bun run preview:cloudflare');
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
      preview_urls?: boolean;
      placement?: {
        mode?: string;
      };
      assets?: {
        directory?: string;
        binding?: string;
        run_worker_first?: string[];
      };
      routes?: Array<{ pattern?: string; zone_name?: string; custom_domain?: boolean }>;
      services?: Array<{ binding?: string; service?: string }>;
      triggers?: { crons?: string[] };
      vars?: Record<string, string>;
    };

    expect(config.name).toBe('site');
    expect(config.main).toBe('src/worker.ts');
    expect(config.preview_urls).toBe(true);
    expect(config.placement?.mode).toBe('smart');
    expect(config.assets?.directory).toBe('./dist');
    expect(config.assets?.binding).toBe('ASSETS');
    expect(config.assets?.run_worker_first).toEqual([
      '/api/*',
      '/mood*',
      '/dev',
      '/dev/*',
      '/oauth*',
      '/v2/*',
      '/docs*',
    ]);
    expect(config.routes).toContainEqual({ pattern: 'buxx.me/*', zone_name: 'buxx.me' });
    expect(config.routes).toContainEqual({ pattern: 'www.buxx.me/*', zone_name: 'buxx.me' });
    expect(config.routes?.some((route) => route.custom_domain === true)).toBe(false);
    expect(config.routes?.some((route) => route.pattern === 'cf-migration.buxx.me')).toBe(false);
    expect(config.routes?.some((route) => route.pattern === 'image.buxx.me')).toBe(false);
    expect(config.services).toContainEqual({ binding: 'API', service: 'site-api' });
    expect(config.vars).toMatchObject({
      SITE_URL: 'https://buxx.me',
      PUBLIC_SITE_URL: 'https://buxx.me',
      GHOST_URL: 'https://blog.buxx.me',
      LASTFM_USER: 'bunizao',
      PUBLIC_HD_IMAGE_URL: 'https://buxx.me/api/v2/images',
      PUBLIC_TURNSTILE_SITE_KEY: '0x4AAAAAACaDQzCbYalmO_xV',
      CHANNEL: 'tutumood',
      TELEGRAM_HOST: 't.me',
    });
    expect(config.triggers).toBeUndefined();
  });

  test('keeps production HTML script CSP tight', () => {
    const headers = readText('public/_headers');

    expect(headers).toContain('https://buxx.me/');
    expect(headers).toContain("script-src 'unsafe-inline' https://buxx.me/_astro/");
    expect(headers).toContain('https://static.cloudflareinsights.com');
    expect(headers).toContain('https://challenges.cloudflare.com');
    expect(headers).not.toContain('/cdn-cgi/challenge-platform/');
    expect(headers).not.toContain("'self' 'unsafe-inline'");
    expect(headers).not.toContain('https://www.googletagmanager.com');
    expect(headers).toContain("base-uri 'self'");
    expect(headers).toContain("object-src 'none'");
  });

  test('adds the same production script CSP to Worker-rendered HTML', () => {
    const middleware = readText('src/middleware.ts');

    expect(middleware).toContain('Content-Security-Policy');
    expect(middleware).toContain("script-src 'unsafe-inline'");
    expect(middleware).toContain('/_astro/');
    expect(middleware).toContain('https://static.cloudflareinsights.com');
    expect(middleware).toContain('https://challenges.cloudflare.com');
    expect(middleware).not.toContain('/cdn-cgi/challenge-platform/');
    expect(middleware).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(middleware).not.toContain('https://www.googletagmanager.com');
  });

  test('blocks Cloudflare JavaScript detections on public HTML', () => {
    const middleware = readText('src/middleware.ts');

    expect(middleware).not.toContain('allowCloudflareDetections');
    expect(middleware).not.toContain('cdn-cgi/challenge-platform');
  });

  test('caches only fully rendered mood feed HTML at the edge', () => {
    const middleware = readText('src/middleware.ts');

    expect(middleware).toContain('MOOD_PAGE_CACHE_TTL_SECONDS = 60');
    expect(middleware).toContain("url.pathname !== '/mood' || url.search");
    expect(middleware).toContain('data-mood-initial-feed');
    expect(middleware).toContain('data-mood-id=');
    expect(middleware).toContain('X-Buxx-Mood-Page-Cache');
    expect(middleware).toContain('caches?.default');
  });

  test('warms the rendered mood cache before Lighthouse', () => {
    const workflow = readText('.github/workflows/lighthouse.yml');

    expect(workflow).toContain('Warm production mood cache');
    expect(workflow).toContain('google-chrome');
    expect(workflow).toContain('--dump-dom');
    expect(workflow).toContain('moto g power (2022)');
    expect(workflow).toContain('data-mood-initial-feed');
    expect(workflow).toContain('ready_count');
  });

  test('keeps non-priority mood images lazy when dimensions are incomplete', () => {
    const renderer = readText('src/features/mood/client/feed-renderer.ts');
    const feedShell = readText('src/features/mood/ui/FeedShell.astro');

    expect(renderer).toContain('const shouldWaitForImageBeforeInsert = isPriorityMedia && !hasResolvedImageLayout');
    expect(renderer).not.toContain("img.loading = 'eager'");
    expect(feedShell).toContain("decoding={isPriorityMedia ? 'sync' : 'async'}");
  });

  test('keeps mood timeline animation code out of the initial chunk', () => {
    const timelineWheel = readText('src/features/mood/client/timeline-wheel.ts');
    const updateWatcher = readText('src/features/mood/client/feed-update-watcher.ts');

    expect(timelineWheel).not.toContain("import gsap from 'gsap'");
    expect(timelineWheel).toContain("import('gsap')");
    expect(timelineWheel).toContain("const feedStartsHidden = feedEl.classList.contains('is-hidden')");
    expect(timelineWheel).toContain('if (isDesktop() && feedStartsHidden)');
    expect(updateWatcher).not.toContain("import gsap from 'gsap'");
    expect(updateWatcher).toContain("import('gsap')");
  });

  test('keeps the mood feed accessible under Lighthouse', () => {
    const moodRoute = readText('src/pages/mood.astro');
    const feedShell = readText('src/features/mood/ui/FeedShell.astro');

    expect(feedShell).toContain('data-mood-list role="region" aria-label="Mood feed"');
    expect(moodRoute).toMatch(
      /:global\(\.mood-load-status\) \{[\s\S]*?color: hsl\(var\(--muted-foreground\)\);/
    );
  });

  test('keeps the home hero reveal chain intact', () => {
    const globals = readText('src/styles/globals.css');
    const hero = readText('src/features/home/ui/Hero.astro');
    const decodeText = readText('src/features/home/ui/DecodeText.astro');
    const experience = readText('src/features/home/ui/Experience.astro');
    const parallax = readText('src/features/home/ui/ParallaxWrapper.astro');
    const homePage = readText('src/pages/index.astro');

    expect(globals).toContain('.js .hero-animate {');
    expect(globals).toMatch(/font-family: 'Geist Mono';[\s\S]*?font-display: optional;/);
    expect(hero).toContain("import DecodeText from '@/features/home/ui/DecodeText.astro';");
    expect(hero).toContain('<DecodeText>');
    expect(hero).toContain('<h1 class="hero-animate');
    expect(hero).toContain('import gsap from \'gsap\';');
    expect(hero).toContain('<span class="hero-lcp-anchor" aria-hidden="true">{typewriterNames[0]}</span>');
    expect(decodeText).toContain('document.fonts?.ready');
    expect(decodeText).toContain('window.setTimeout(resolve, 400)');
    expect(decodeText).toContain('const FALLBACK_START_MS = 1500;');
    expect(decodeText).toContain('const LINE_DURATION_PER_CHAR = 0.024;');
    expect(decodeText).toContain('const LINE_DELAY_FACTOR = 0.16;');
    expect(decodeText).toContain('const timeline = gsap.timeline({ onComplete: finish });');
    expect(hero).toContain('const identity = heroElements.filter((el) => !el.hasAttribute');
    expect(hero).toContain('gsap.set(heroElements, { opacity: 0, y: 20 });');
    expect(hero).toContain('heroTl.to(identity, {');
    expect(hero).toContain('heroTl.to(widgets, {');
    expect(hero).toContain("window.dispatchEvent(new CustomEvent('home:hero-bio-ready'))");
    expect(readText('src/features/home/ui/Listening.astro')).toContain('max-width: min(18ch, calc(100% - 48px));');
    expect(experience).toContain('<ExperienceTimeline client:visible />');
    expect(parallax).toContain("import('gsap/ScrollTrigger')");
    expect(parallax).toContain("window.addEventListener('load', scheduleSkatingEffects");
    expect(homePage).toContain(':global(.page-container > section:not(#projects-section))');
    expect(homePage).toContain('content-visibility: auto;');
  });

  test('reads Turnstile site key from runtime public env on the mood route', () => {
    const moodRoute = readText('src/pages/mood.astro');

    expect(moodRoute).toContain("readPublicEnv(Astro.locals, 'TURNSTILE_SITE_KEY')");
    expect(moodRoute).not.toContain('import.meta.env.PUBLIC_TURNSTILE_SITE_KEY');
  });

  test('keeps the homepage dev surface flag away from Vite import.meta transforms', () => {
    const homePage = readText('src/pages/index.astro');

    expect(homePage).toContain("process.env.DEV_SURFACE === 'home'");
    expect(homePage).not.toContain('import.meta.env.DEV');
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

  test('keeps Writing runtime hydration behind the private API fallback', () => {
    expect(existsSync(join(root, 'src/pages/api/writing.ts'))).toBe(false);
    const postsComponent = readText('src/features/home/ui/Posts.astro');

    expect(postsComponent).toContain("fetch('/api/writing'");
    expect(postsComponent).toContain('await hydrateWritingPosts();');
    expect(postsComponent).toContain('void initWriting();');
    expect(postsComponent).toContain(':global(#writing-section .post-item)');
    expect(postsComponent).toContain(':global(#writing-section .post-meta)');
  });
});
