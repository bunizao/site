import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

describe('blog analytics beacon', () => {
  test('is wired into blog article pages', () => {
    const source = readFileSync(new URL('../../src/pages/blog/[slug].astro', import.meta.url), 'utf8');

    expect(source).toContain("import BlogArticleBeacon from '@/features/posts/ui/BlogArticleBeacon.astro'");
    expect(source).toContain('<BlogArticleBeacon slug={post.slug} />');
  });

  test('keeps the client script first-party and lifecycle based', () => {
    const source = readFileSync(new URL('../../src/features/posts/ui/BlogArticleBeacon.astro', import.meta.url), 'utf8');

    expect(source).toContain('BLOG_ANALYTICS_EVENT_ENDPOINT');
    expect(source).toContain('isPublicAnalyticsHost');
    expect(source).toContain("hostname === 'buxx.me'");
    expect(source).toContain('navigator.sendBeacon');
    expect(source).toContain("credentials: 'same-origin'");
    expect(source).toContain('visibilitychange');
    expect(source).toContain('pagehide');
    expect(source).toContain('localStorage');
    expect(source).toContain('sessionStorage');
    expect(source).toContain('dwellMs');
    expect(source).toContain('scrollDepth');
    expect(source).not.toContain('gtag');
    expect(source).not.toContain('google-analytics');
  });

  test('sanitizes referrers before sending analytics payload', () => {
    const source = readFileSync(new URL('../../src/features/posts/ui/BlogArticleBeacon.astro', import.meta.url), 'utf8');

    expect(source).toContain('function sanitizedReferrer()');
    expect(source).toContain('if (!document.referrer) return null;');
    expect(source).toContain('const ref = new URL(document.referrer);');
    expect(source).toContain('return `${ref.origin}${ref.pathname}`;');
    expect(source).toContain('catch {');
    expect(source).toContain('referrer: sanitizedReferrer(),');
    expect(source).not.toContain('referrer: document.referrer');
  });

  test('does not add a duplicate Google Tag Gateway loader', () => {
    const source = readFileSync(new URL('../../src/layouts/BlogLayout.astro', import.meta.url), 'utf8');

    expect(source).not.toContain('/gmetrics/');
    expect(source).not.toContain('googletagmanager');
    expect(source).not.toContain('googleTagGateway');
    expect(source).not.toContain('gtag(');
    expect(source).not.toMatch(/<script[^>]+src=["']\/gmetrics\/["']/);
  });

  test('favicon adapts to browser theme while the topbar mark stays webp', () => {
    const layout = readFileSync(new URL('../../src/layouts/BlogLayout.astro', import.meta.url), 'utf8');
    const toc = readFileSync(new URL('../../src/features/posts/ui/TableOfContents.astro', import.meta.url), 'utf8');

    // Tab strips ignore site CSS: only an SVG favicon with its own
    // prefers-color-scheme rule can follow the browser's dark mode. The
    // in-page marks keep the raster webp and invert via .dark CSS.
    expect(layout).toContain("import { BLOG_FAVICON } from '@/lib/favicon';");
    expect(layout).toContain('<link rel="icon" href={BLOG_FAVICON} type="image/svg+xml" />');
    expect(layout).not.toContain('<link rel="icon" href={blogMarkAsset}');
    expect(layout).toContain('const blogMarkAsset = blog.mark;');
    expect(layout).toContain('<img src={blogMarkAsset} alt={blog.name} width="40" height="40" />');
    expect(toc).toContain('<img src={blogMarkAsset} alt={blog.name} width="30" height="30" />');
  });

  test('favicon module badges dev and versions prod hrefs', () => {
    const favicon = readFileSync(new URL('../../src/lib/favicon.ts', import.meta.url), 'utf8');

    expect(favicon).toContain('import.meta.env.DEV');
    expect(favicon).toContain("'/logo/peek-dev.svg'");
    expect(favicon).toContain("'/blog-mark-dev.svg'");
    expect(favicon).toContain("'/logo/peek.svg?v=3'");
    expect(favicon).toContain("'/blog-mark.svg?v=2'");
  });

  test('blog favicon SVGs self-adapt and carry the dev badge', () => {
    const prod = readFileSync(new URL('../../public/blog-mark.svg', import.meta.url), 'utf8');
    const dev = readFileSync(new URL('../../public/blog-mark-dev.svg', import.meta.url), 'utf8');

    expect(prod).toContain('prefers-color-scheme: dark');
    expect(prod).toContain('invert(1)');
    expect(dev).toContain('<rect width="128" height="128" rx="24" fill="#f59e0b"/>');
  });

  test('keeps the shared blog mark asset encoded as WebP', () => {
    const mark = readFileSync(new URL('../../public/blog-mark.webp', import.meta.url));

    expect(mark.subarray(0, 4).toString()).toBe('RIFF');
    expect(mark.subarray(8, 12).toString()).toBe('WEBP');
  });
});
