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

  test('loads the Google Tag Gateway outside the load-critical path', () => {
    const source = readFileSync(new URL('../../src/layouts/BlogLayout.astro', import.meta.url), 'utf8');

    expect(source).toContain("const googleTagGatewayPath = '/gmetrics/';");
    expect(source).toContain("window.addEventListener('load', scheduleGoogleTagGateway, { once: true });");
    expect(source).toContain('window.requestIdleCallback(loadGoogleTagGateway, { timeout: 2000 });');
    expect(source).toContain("script.dataset.buxxGoogleTagGateway = 'true';");
    expect(source).toContain('script.src = googleTagGatewayPath;');
    expect(source).not.toMatch(/<script[^>]+src=["']\/gmetrics\/["']/);
  });

  test('uses one network asset for the blog mark on blog pages', () => {
    const layout = readFileSync(new URL('../../src/layouts/BlogLayout.astro', import.meta.url), 'utf8');
    const toc = readFileSync(new URL('../../src/features/posts/ui/TableOfContents.astro', import.meta.url), 'utf8');

    expect(layout).toContain("const blogMarkAsset = '/blog-mark.svg';");
    expect(layout).toContain('<link rel="icon" href={blogMarkAsset} type="image/svg+xml" />');
    expect(layout).toContain('<img src={blogMarkAsset} alt={blog.name} width="40" height="40" />');
    expect(layout).not.toContain('<link rel="icon" href={blog.mark} type="image/webp" />');
    expect(toc).toContain('<img src={blogMarkAsset} alt={blog.name} width="30" height="30" />');
  });
});
