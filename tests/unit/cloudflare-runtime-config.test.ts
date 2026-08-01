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

  test('keeps preview smoke manual and independent from PR validation', () => {
    const previewWorkflow = readText('.github/workflows/preview-smoke.yml');

    expect(previewWorkflow).toContain('workflow_dispatch:');
    expect(previewWorkflow).toContain('node-version-file: .node-version');
    expect(previewWorkflow).toContain('Configure Cloudflare Access preview');
    expect(previewWorkflow).toContain('configure-cloudflare-access-preview.mjs');
    expect(previewWorkflow).toContain('PUBLIC_GHOST_URL: ${{ vars.PUBLIC_GHOST_URL ||');
    expect(previewWorkflow).toContain('GHOST_CONTENT_API_KEY: ${{ secrets.GHOST_CONTENT_API_KEY }}');
    expect(previewWorkflow).toContain('run: bun run build:cloudflare');
    expect(previewWorkflow).toContain('wrangler versions upload');
    expect(previewWorkflow).toContain('--preview-alias "$PREVIEW_ALIAS"');
    expect(previewWorkflow).toContain(
      'E2E_BASE_URL: ${{ steps.context.outputs.preview_url || steps.cloudflare-preview.outputs.preview_url }}'
    );
    expect(previewWorkflow).toContain('local checked-out build');
    expect(previewWorkflow).not.toContain('pull_request:');
    expect(previewWorkflow).not.toContain('deployment_status:');
    expect(previewWorkflow).not.toContain('github.event.deployment');
    expect(previewWorkflow).not.toContain('should_run');
  });

  test('keeps PR builds independent from Ghost secrets', () => {
    const prWorkflow = readText('.github/workflows/pr-tests.yml');

    expect(prWorkflow).toContain("GHOST_MOCK_CONTENT: '1'");
    expect(prWorkflow).toContain('Reject mock Cloudflare deployment');
    expect(prWorkflow).toContain('if bun run guard:cloudflare-deploy');
    expect(prWorkflow).toContain('Cloudflare deploy blocked mock Ghost posts');
    expect(prWorkflow).not.toContain('wrangler deploy --config dist/server/wrangler.json --dry-run');
    expect(prWorkflow).not.toContain('secrets.GHOST_CONTENT_API_KEY');
    expect(prWorkflow.match(/Install Playwright Chromium/g)).toHaveLength(1);
    expect(prWorkflow).toContain('node-version-file: .node-version');
  });

  test('keeps dependency updates compatible with Bun and bounded CI load', () => {
    const dependabot = readText('.github/dependabot.yml');

    expect(dependabot).toContain('package-ecosystem: bun');
    expect(dependabot).toContain('package-ecosystem: github-actions');
    expect(dependabot).toContain('open-pull-requests-limit: 5');
    expect(dependabot).toContain('minor-and-patch:');
    expect(dependabot).not.toContain('package-ecosystem: ""');
  });

  test('runs Lighthouse without Vercel deployment events', () => {
    const lighthouseWorkflow = readText('.github/workflows/lighthouse.yml');
    const lighthouseConfig = readText('config/lighthouse.cjs');

    expect(lighthouseWorkflow).toContain('push:');
    expect(lighthouseWorkflow).toContain('schedule:');
    expect(lighthouseWorkflow).toContain('workflow_dispatch:');
    expect(lighthouseWorkflow).toContain("inputUrl || 'https://buxx.me'");
    expect(lighthouseWorkflow).toContain('Wait for Cloudflare production deploy');
    expect(lighthouseWorkflow).toContain('node-version-file: .node-version');
    expect(lighthouseWorkflow).toContain('branches: [main]');
    expect(lighthouseWorkflow).toContain('Resolve Lighthouse tracker policy');
    expect(lighthouseWorkflow).toContain("steps.tracker.outputs.notify_anomaly == 'true'");
    expect(lighthouseWorkflow).toContain("steps.tracker.outputs.close_recovery == 'true'");
    expect(lighthouseWorkflow).toContain("if (issue.state === 'open')");
    expect(lighthouseWorkflow).toContain('skipped duplicate notification');
    expect(lighthouseWorkflow).toContain("if (issue.state === 'closed')");
    expect(lighthouseWorkflow).toContain('skipped duplicate recovery notification');
    expect(lighthouseConfig).toContain("'/,/mood,/blog/'");
    expect(lighthouseConfig).toContain('--disable-background-timer-throttling');
    expect(lighthouseConfig).toContain('--disable-backgrounding-occluded-windows');
    expect(lighthouseConfig).toContain('--disable-renderer-backgrounding');
    expect(lighthouseConfig).toContain('--disable-features=CalculateNativeWinOcclusion');
    expect(lighthouseWorkflow).not.toContain('deployment_status:');
    expect(lighthouseWorkflow).not.toContain('github.event.deployment');
  });

  test('runs ops health against the current Telegram webhook route', () => {
    const opsWorkflow = readText('.github/workflows/ops-health.yml');

    expect(opsWorkflow).toContain('TELEGRAM_EXPECTED_WEBHOOK_URL: https://api.buxx.me/webhooks/telegram');
    expect(opsWorkflow).toContain('include-hidden-files: true');
    expect(opsWorkflow).toContain('path: .ops-health-cache/ignored-decision.json');
    expect(opsWorkflow).not.toContain('path: .ops-health/ignored-decision.json');
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
    expect(packageJson.scripts?.['build:cloudflare']).toBe('node scripts/build-cloudflare.mjs');
    expect(packageJson.scripts?.['deploy:cloudflare']).toContain('bun run guard:cloudflare-deploy');
    expect(packageJson.scripts?.['upload:cloudflare']).toContain('bun run guard:cloudflare-deploy');
    expect(packageJson.scripts?.['preview:cloudflare']).toBe('bun run build:cloudflare && wrangler dev --config dist/server/wrangler.json');
    expect(packageJson.scripts?.['tail:cloudflare']).toBe('wrangler tail');
    expect(packageJson.scripts?.['types:cloudflare']).toBe('wrangler types');
    expect(packageJson.scripts?.check).toBe('astro sync && node scripts/astro-check-legacy-typescript.mjs');
    expect(readText('scripts/astro-check-legacy-typescript.mjs')).toContain('typescript-astro-check');
    expect(packageJson.scripts?.build).toStartWith('astro build');
    expect(packageJson.scripts?.build).toContain('bun scripts/generate-agent-markdown.ts');
    expect(packageJson.scripts?.build).toContain('cloudflare-deploy-guard.mjs install');
    expect(packageJson.scripts?.dev).toContain('astro dev');
    expect(packageJson.scripts?.dev).not.toContain('bunx --bun');
  });

  test('keeps Ghost build secrets out of the Vite environment bundle', () => {
    const ghostConfig = readText('src/features/posts/adapter/ghost/config.ts');

    expect(ghostConfig).not.toContain('readViteEnv');
    expect(ghostConfig).not.toContain('Record<string, unknown>');
    expect(ghostConfig).toContain('return readProcessEnv(name);');
  });

  test('returns before loading Ghost draft preview dependencies in production', () => {
    const previewRoute = readText('src/pages/blog/preview/[id].astro');
    const productionGuardIndex = previewRoute.indexOf('if (!import.meta.env.DEV)');
    const productionReturnIndex = previewRoute.indexOf(
      "return new Response('Not found.'",
      productionGuardIndex,
    );

    expect(productionGuardIndex).toBeGreaterThan(-1);
    expect(productionReturnIndex).toBeGreaterThan(productionGuardIndex);
    expect(previewRoute.slice(0, productionGuardIndex)).not.toMatch(/\bimport(?:\s|\()/);

    const previewDependencies = [
      '@/layouts/BlogLayout.astro',
      '@/features/posts/ui/Prose.astro',
      '@/features/posts/ui/AiCredit.astro',
      '@/features/posts/ui/NotByAI.astro',
      '@/features/posts/format',
      '@/features/posts/server/directives/authors',
      '@/features/posts/server/ghost-preview',
    ];

    for (const dependency of previewDependencies) {
      const dynamicImportIndex = previewRoute.indexOf(`import('${dependency}')`);

      expect(dynamicImportIndex).toBeGreaterThan(productionReturnIndex);
      expect(previewRoute).not.toContain(`from '${dependency}'`);
      expect(previewRoute).not.toContain(`import '${dependency}'`);
    }
  });

  test('loads Tailwind 4 through its stylesheet entrypoint', () => {
    const globals = readText('src/styles/globals.css');
    const postcss = readText('postcss.config.cjs');

    expect(globals).toMatch(/^@import "tailwindcss\/index\.css";/);
    expect(globals).toContain('@config "../../tailwind.config.mjs";');
    expect(globals).not.toContain('@tailwind base;');
    expect(postcss).toContain('"@tailwindcss/postcss": {}');
  });

  test('defines a primary Worker with static assets and dynamic route interception', () => {
    const config = readJson('wrangler.jsonc') as {
      name?: string;
      main?: string;
      preview_urls?: boolean;
      placement?: {
        mode?: string;
      };
      cache?: {
        enabled?: boolean;
      };
      assets?: {
        directory?: string;
        binding?: string;
        run_worker_first?: string[];
      };
      routes?: Array<{ pattern?: string; zone_name?: string; custom_domain?: boolean }>;
      services?: Array<{ binding?: string; service?: string }>;
      kv_namespaces?: Array<{ binding?: string; id?: string }>;
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
      '/',
      '/api/*',
      '/blog*',
      '/llms.txt',
      '/mood*',
      '/privacy*',
      '/projects*',
      '/sitemap.xml',
      '/dev',
      '/dev/*',
      '/oauth*',
      '/v2/*',
    ]);
    expect(config.routes).toContainEqual({ pattern: 'buxx.me/*', zone_name: 'buxx.me' });
    expect(config.routes).toContainEqual({ pattern: 'www.buxx.me/*', zone_name: 'buxx.me' });
    expect(config.cache).toEqual({ enabled: true });
    expect(config.routes?.some((route) => route.pattern?.startsWith('blog.buxx.me'))).toBe(false);
    expect(config.routes?.some((route) => route.custom_domain === true)).toBe(false);
    expect(config.routes?.some((route) => route.pattern === 'cf-migration.buxx.me')).toBe(false);
    expect(config.routes?.some((route) => route.pattern === 'image.buxx.me')).toBe(false);
    expect(config.services).toContainEqual({ binding: 'API', service: 'site-api' });
    expect(config.kv_namespaces).toContainEqual({
      binding: 'SESSION',
      id: 'e1a1eec45d974679898530298997b465',
    });
    expect(config.vars).toMatchObject({
      SITE_URL: 'https://buxx.me',
      PUBLIC_SITE_URL: 'https://buxx.me',
      PUBLIC_GHOST_URL: 'https://blog.buxx.me',
      PUBLIC_BLOG_OG_IMAGE_ENDPOINT: 'https://og.tuuhub.com/api/og',
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
    expect(headers).toContain("script-src 'self' 'unsafe-inline'");
    expect(headers).toContain('https://js-cdn.music.apple.com');
    expect(headers).toContain('https://www.youtube.com');
    expect(headers).toContain('https://static.cloudflareinsights.com');
    expect(headers).toContain('https://challenges.cloudflare.com');
    expect(headers).toContain('Cache-Control: public, max-age=0, must-revalidate');
    expect(headers).not.toContain('no-transform');
    expect(headers).toContain('https://buxx.me/blog*');
    expect(headers).not.toContain('https://buxx.me/gmetrics/');
    expect(headers).toContain('https://www.googletagmanager.com');
    expect(headers).toContain("base-uri 'self'");
    expect(headers).toContain("object-src 'none'");
  });

  test('adds the same production script CSP to Worker-rendered HTML', () => {
    const middleware = readText('src/middleware.ts');

    expect(middleware).toContain('Content-Security-Policy');
    expect(middleware).toContain("script-src 'self' 'unsafe-inline'");
    expect(middleware).toContain('https://js-cdn.music.apple.com');
    expect(middleware).toContain('https://www.youtube.com');
    expect(middleware).toContain('https://static.cloudflareinsights.com');
    expect(middleware).toContain('https://challenges.cloudflare.com');
    expect(middleware).not.toContain('no-transform');
    expect(middleware).not.toContain('${cleanOrigin}/gmetrics/');
    expect(middleware).toContain('https://www.googletagmanager.com');
  });

  test('keeps Cloudflare JavaScript detections policy explicit', () => {
    const middleware = readText('src/middleware.ts');

    expect(middleware).not.toContain('allowCloudflareDetections');
    expect(middleware).toContain("script-src 'self' 'unsafe-inline'");
  });

  test('caches rendered content variants at the edge', () => {
    const middleware = readText('src/middleware.ts');
    const registry = readText('src/features/agent-markdown/server/registry.ts');
    const responses = readText('src/features/agent-markdown/server/responses.ts');
    const edgeCache = readText('src/lib/http/edge-cache.ts');
    const builtBlog = readText('src/features/agent-markdown/server/built-blog.ts');

    expect(registry).toContain('MOOD_FEED_PAGE_CACHE_TTL_SECONDS = 300');
    expect(registry).toContain('MOOD_FEED_PAGE_STALE_WHILE_REVALIDATE_SECONDS = 1800');
    expect(responses).toContain('CONTENT_STALE_WHILE_REVALIDATE_SECONDS = 300');
    expect(responses).toContain('Cloudflare-CDN-Cache-Control');
    expect(responses).toContain('stale-while-revalidate=');
    expect(responses).toContain('NO_STORE_CACHE_CONTROL');
    expect(registry).toContain('readBuiltBlogMarkdown');
    expect(responses).toContain("variant: 'html'");
    expect(responses).toContain("variant: 'markdown'");
    expect(responses).toContain('url.search');
    expect(middleware).toContain('readCachedHtmlPage');
    expect(registry).toContain('data-mood-initial-feed');
    expect(registry).toContain('data-mood-id=');
    expect(registry).toContain('X-Buxx-Mood-Page-Cache');
    expect(edgeCache).toContain('caches?.default');
    expect(builtBlog).toContain('/_agent-markdown/blog/');
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
    const mediaHydration = readText('src/features/mood/client/feed-media-hydration.ts');

    expect(feedShell).toContain('src={thumbImage}');
    expect(feedShell).not.toContain('withWidthParam(thumbImage');
    expect(feedShell).not.toContain('srcset={buildSrcSet(thumbImage');
    expect(mediaHydration).toContain("img.removeAttribute('srcset')");
    expect(mediaHydration).toContain("img.removeAttribute('sizes')");
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
    const decodeEngine = readText('packages/decode-text/src/index.ts');
    const experience = readText('src/features/home/ui/Experience.astro');
    const parallax = readText('src/features/home/ui/ParallaxWrapper.astro');
    const homeReveal = readText('src/lib/home-reveal.ts');
    const homePage = readText('src/pages/index.astro');

    expect(globals).toContain('.js .hero-animate {');
    expect(globals).toMatch(/font-family: 'Geist Mono';[\s\S]*?font-display: optional;/);
    expect(hero).toContain("import DecodeText from '@/features/home/ui/DecodeText.astro';");
    expect(hero).toContain('<DecodeText>');
    expect(hero).toContain('<h1 class="hero-animate');
    expect(hero).toContain("const { default: gsap } = await import('gsap');");
    expect(hero).toContain('const lcpAnchorName = typewriterNames.reduce');
    expect(hero).toContain('<span class="hero-lcp-anchor" aria-hidden="true">{lcpAnchorName}</span>');
    expect(decodeEngine).toContain('document.fonts?.ready');
    expect(decodeEngine).toContain('window.setTimeout(resolve, opts.fontTimeout)');
    expect(decodeText).toContain('const FALLBACK_START_MS = 1500;');
    expect(decodeEngine).toContain('durationPerChar:');
    // One eased clock for the paragraph. Easing per line instead gives each its
    // own accelerate/settle cycle and the bio reveals as a top-to-bottom queue.
    expect(decodeEngine).toContain('opts.ease(clock / duration)');
    expect(decodeEngine).toContain('requestAnimationFrame(tick)');
    expect(hero).toContain('const identity = heroElements.filter((el) => !el.hasAttribute');
    expect(hero).toContain('gsap.set(heroElements, { opacity: 0, y: 20 });');
    expect(hero).toContain('heroTl.to(identity, {');
    expect(hero).toContain('heroTl.to(widgets, {');
    expect(hero).toContain("window.dispatchEvent(new CustomEvent('home:hero-bio-ready'))");
    const listeningMarkup = readText('src/lib/listening/markup.ts');
    const listeningStyles = readText('src/styles/listening.css');
    const listeningController = readText('src/lib/listening/controller.ts');
    expect(listeningMarkup).toContain('data-title="${escapeHtml(title)}"');
    expect(listeningStyles).toContain('content: attr(data-title);');
    expect(listeningController).toContain('titleLabel.dataset.title = nextTitle;');
    expect(listeningStyles).toContain('max-width: min(18ch, calc(100% - 48px));');
    expect(experience).toContain('<ExperienceTimeline client:visible />');
    expect(parallax).not.toContain("import('gsap/ScrollTrigger')");
    expect(parallax).not.toContain('scheduleSkatingEffects');
    expect(homeReveal).toContain('export const initHomeReveal');
    expect(homeReveal).toContain('new IntersectionObserver(');
    expect(homePage).toContain("import '@/styles/home-reveal.css';");
    expect(homePage).toContain("import { initHomeReveal } from '@/lib/home-reveal';");
    expect(homePage).not.toContain(':global(.page-container > section:not(#projects-section):not(#writing-section))');
    expect(homePage).toContain(':global(.page-container > footer)');
    expect(homePage).toContain('content-visibility: auto;');
    expect(homePage).not.toMatch(/content-visibility[\s\S]{0,200}> section/);
  });

  test('reads Turnstile site key from runtime public env on the mood route', () => {
    const moodRoute = readText('src/pages/mood.astro');

    expect(moodRoute).toContain("readPublicEnv(Astro.locals, 'TURNSTILE_SITE_KEY')");
    expect(moodRoute).not.toContain('import.meta.env.PUBLIC_TURNSTILE_SITE_KEY');
  });

  test('reads Turnstile site key from runtime public env on blog subscribe surfaces', () => {
    const blogMasthead = readText('src/features/posts/ui/BlogMasthead.astro');
    const blogArticle = readText('src/pages/blog/[slug].astro');

    expect(blogMasthead).toContain("readPublicEnv(Astro.locals, 'TURNSTILE_SITE_KEY')");
    expect(blogArticle).toContain("readPublicEnv(Astro.locals, 'TURNSTILE_SITE_KEY')");
    expect(blogMasthead).not.toContain('import.meta.env.PUBLIC_TURNSTILE_SITE_KEY');
    expect(blogArticle).not.toContain('import.meta.env.PUBLIC_TURNSTILE_SITE_KEY');
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
    ].map(readText).join('\n');

    expect(docsText).toContain('Cloudflare Workers Builds deploy hook');
    expect(docsText).toContain('PUBLIC_GHOST_URL');
    expect(docsText).toContain('GHOST_CONTENT_API_KEY');
    expect(docsText).toContain('Cloudflare build environment');
    expect(docsText).toContain('Post published');
    expect(docsText).toContain('blog.buxx.me');
    expect(docsText).toContain('https://buxx.me/blog');
    expect(docsText).not.toContain(['https://api.vercel.com', 'v1/integrations/deploy'].join('/'));
  });

  test('renders Writing from the internal content provider at build time', () => {
    // The home Writing section is a build-time doorway into the blog, not a
    // runtime feed: it reads the same provider /blog reads and links internally.
    // No /api/writing route, no external Ghost hydration.
    expect(existsSync(join(root, 'src/pages/api/writing.ts'))).toBe(false);
    const postsComponent = readText('src/features/home/ui/Posts.astro');

    expect(postsComponent).not.toContain("fetch('/api/writing'");
    expect(postsComponent).toContain("from '@/features/posts/server/content'");
    expect(postsComponent).toContain("from '@/features/posts/display'");
    expect(postsComponent).toContain('const locale = blog.locale.home;');
    expect(postsComponent).toContain('getAllPosts()');
    expect(postsComponent).toContain('blog.copy[locale]');
    expect(postsComponent).toContain('getTagLabel(tag, locale)');
    expect(postsComponent).toContain('href={postPath(post.slug)}');
    expect(postsComponent).toContain("import { attachHoverIndicator } from '@/lib/hover-indicator';");
    expect(postsComponent).toContain('data-writing-post-list');
    expect(postsComponent).toContain('attachHoverIndicator(writingPostList, {');
    expect(postsComponent).toContain(':global(#writing-section .post-item)');
    expect(postsComponent).toContain(':global(#writing-section .post-meta)');
  });
});
