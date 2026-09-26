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

  test('keeps non-priority mood images lazy when dimensions are incomplete', () => {
    const renderer = readText('src/features/mood/client/feed-renderer.ts');
    const feedShell = readText('src/features/mood/ui/FeedShell.astro');
    const mediaHydration = readText('src/features/mood/client/feed-media-hydration.ts');
    const feedThumbnail = readText('src/features/mood/shared/feed-thumbnail.ts');

    expect(feedShell).toContain('src={isPriorityMedia ? thumbImage : undefined}');
    expect(feedShell).toContain('data-deferred-src={!isPriorityMedia ? thumbImage : undefined}');
    expect(feedShell).not.toContain('withWidthParam(thumbImage');
    expect(feedShell).not.toContain('srcset={buildSrcSet(thumbImage');
    expect(mediaHydration).toContain("img.removeAttribute('srcset')");
    expect(mediaHydration).toContain("img.removeAttribute('sizes')");
    expect(mediaHydration).toContain('registerDeferredImage(target, () => hydrateDeferredImage(node))');
    expect(feedThumbnail).toContain('getMoodImageRatio');
    expect(renderer).toContain('img.dataset.deferredSrc = imageSrc');
    expect(renderer).toContain('mediaHydrator.registerDeferredImage(thumbWrap');
    expect(renderer).not.toContain('shouldWaitForImageBeforeInsert');
    expect(renderer).not.toContain("img.loading = 'eager'");
    expect(feedShell).toContain("decoding={isPriorityMedia ? 'sync' : 'async'}");
  });

  test('keeps mood timeline animation code out of the initial chunk', () => {
    const timelineWheel = readText('src/features/mood/client/timeline-wheel.ts');
    const updateWatcher = readText('src/features/mood/client/feed-update-watcher.ts');

    expect(timelineWheel).not.toContain("import gsap from 'gsap'");
    expect(timelineWheel).toContain("import('gsap')");
    expect(timelineWheel).toContain("const feedStartsHidden = feedEl.classList.contains('is-hidden')");
    expect(timelineWheel).toContain('if (feedStartsHidden)');
    expect(updateWatcher).not.toContain("import gsap from 'gsap'");
    expect(updateWatcher).toContain("import('gsap')");
  });

  test('loads the SSR mood feed controller after the critical path', () => {
    const moodRoute = readText('src/pages/mood.astro');

    expect(moodRoute).not.toContain(
      "import { initMoodFeedController } from '@/features/mood/client/feed-controller'",
    );
    expect(moodRoute).toContain("import('@/features/mood/client/feed-controller')");
    expect(moodRoute).toContain("window.addEventListener('load', initFeed, { once: true })");
    expect(moodRoute).toContain("feed?.classList.contains('is-hidden')");
    expect(moodRoute).toContain('feed?.dataset.moodAnchorId');
  });

  test('keeps the mood feed accessible under Lighthouse', () => {
    const moodRoute = readText('src/pages/mood.astro');
    const feedShell = readText('src/features/mood/ui/FeedShell.astro');

    expect(feedShell).toContain('data-mood-list role="region" aria-label="Mood feed"');
    expect(moodRoute).toMatch(
      /:global\(\.mood-load-status\) \{[\s\S]*?color: hsl\(var\(--muted-foreground\)\);/
    );
  });
});
